import { Bus } from "./bus";
import {
  SearchStarted,
  SearchResultsBatch,
  SearchResultsUpdated,
  SearchPluginError,
  SearchCompleted,
  SearchCancelled,
} from "./bus/events";
import { PluginLoader, type PluginRegistration, type PluginSearchError } from "./plugin-loader";
import { KeyValueStorage } from "./keyValueStorage";
import type { SearchResult as PluginSearchResult } from "../plugin";

/**
 * Extended search result with aggregation metadata
 */
export interface SearchResult extends PluginSearchResult {
  id: string;
  pluginIds: string[];
  pluginDisplayNames: string[];
  receivedAt: number;
}

/**
 * Search response snapshot
 */
export interface SearchResponse {
  results: SearchResult[];
  errors: PluginSearchError[];
}

/**
 * Sort order options
 */
export type SortOrder = "relevance" | "recency" | "source";

/**
 * Search options
 */
export interface SearchOptions {
  signal?: AbortSignal;
  limit?: number;
  sortOrder?: SortOrder;
}

/**
 * Search engine configuration
 */
export interface SearchEngineOptions {
  cache?: KeyValueStorage<string, PluginSearchResult[]>;
  cacheTtlMs?: number;
}

const createResultId = (index: number) => {
  const suffix =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : Date.now();
  return `${index}-${suffix}`;
};

const scoreFallback = (result: SearchResult) => {
  return typeof result.score === "number" ? result.score : 0;
};

const timestampFallback = (result: SearchResult) => {
  return typeof result.timestamp === "number" ? result.timestamp : result.receivedAt;
};

/**
 * Sort results based on the specified order
 */
const sortResults = (results: SearchResult[], order: SortOrder): SearchResult[] => {
  switch (order) {
    case "recency":
      return [...results].sort(
        (a, b) =>
          timestampFallback(b) - timestampFallback(a) ||
          scoreFallback(b) - scoreFallback(a),
      );
    case "source":
      return [...results].sort((a, b) => {
        const pluginCountDiff = b.pluginIds.length - a.pluginIds.length;
        if (pluginCountDiff !== 0) return pluginCountDiff;
        const byPluginIds = a.pluginIds.join(", ").localeCompare(b.pluginIds.join(", "));
        if (byPluginIds !== 0) return byPluginIds;
        return scoreFallback(b) - scoreFallback(a);
      });
    case "relevance":
    default:
      return [...results].sort((a, b) => {
        const pluginCountDiff = b.pluginIds.length - a.pluginIds.length;
        if (pluginCountDiff !== 0) return pluginCountDiff;
        const byScore = scoreFallback(b) - scoreFallback(a);
        if (byScore !== 0) return byScore;
        return timestampFallback(b) - timestampFallback(a);
      });
  }
};

/**
 * Aggregated entry for URL-based deduplication
 */
interface AggregatedPluginEntry {
  pluginId: string;
  pluginDisplayName: string;
  result: PluginSearchResult;
}

interface AggregatedEntry {
  pluginEntries: AggregatedPluginEntry[];
  combined?: PluginSearchResult;
  dirty: boolean;
  hasScore: boolean;
  scoreTotal: number;
}

/**
 * Result aggregator - combines results from multiple plugins
 * Results are deduplicated by URL and scores are combined
 */
class ResultAggregator {
  private readonly entries = new Map<string, AggregatedEntry>();

  /**
   * Add results from a plugin batch
   * This is the key method - results come in as complete batches
   * and are merged into the existing aggregated results
   */
  addResults(
    pluginId: string,
    pluginDisplayName: string,
    results: PluginSearchResult[] | undefined,
  ): void {
    if (!Array.isArray(results) || results.length === 0) {
      return;
    }

    for (const result of results) {
      if (!result) continue;

      const key = result.url;
      let entry = this.entries.get(key);

      if (!entry) {
        entry = {
          pluginEntries: [],
          dirty: true,
          hasScore: false,
          scoreTotal: 0,
        };
        this.entries.set(key, entry);
      }

      const pluginEntry: AggregatedPluginEntry = {
        pluginId,
        pluginDisplayName,
        result: { ...result },
      };

      // Insert sorted by plugin ID
      const insertIndex = entry.pluginEntries.findIndex(
        (existing) => pluginId.localeCompare(existing.pluginId) > 0,
      );

      if (insertIndex === -1) {
        entry.pluginEntries.push(pluginEntry);
      } else {
        entry.pluginEntries.splice(insertIndex, 0, pluginEntry);
      }

      if (typeof result.score === "number") {
        entry.hasScore = true;
        entry.scoreTotal += result.score;
      }

      entry.dirty = true;
    }
  }

  /**
   * Get aggregated results
   */
  getResults(): SearchResult[] {
    if (this.entries.size === 0) {
      return [];
    }

    const receivedAt = Date.now();
    return Array.from(this.entries.values()).map((entry, index) => {
      if (entry.dirty || !entry.combined) {
        entry.combined = this.buildCombinedResult(entry.pluginEntries);
        entry.dirty = false;
      }

      const combinedScore = entry.hasScore ? entry.scoreTotal : undefined;
      const pluginIds = entry.pluginEntries.map((v) => v.pluginId);
      const pluginDisplayNames = entry.pluginEntries.map((v) => v.pluginDisplayName);

      return {
        ...entry.combined,
        ...(typeof combinedScore === "number" ? { score: combinedScore } : {}),
        id: createResultId(index),
        pluginIds,
        pluginDisplayNames,
        receivedAt,
      };
    });
  }

  private buildCombinedResult(entries: AggregatedPluginEntry[]): PluginSearchResult {
    if (entries.length === 0) {
      return {} as PluginSearchResult;
    }

    const first = entries[0]!;
    const combined: PluginSearchResult = { ...first.result };

    for (let i = 1; i < entries.length; i++) {
      Object.assign(combined, entries[i]!.result);
    }

    return combined;
  }

  /**
   * Get number of unique URLs
   */
  get size(): number {
    return this.entries.size;
  }
}

/**
 * Search Engine - orchestrates plugin searches with streaming results
 * 
 * Key design principles (inspired by OpenCode):
 * 1. Results stream in as plugin batches complete (no flickering)
 * 2. Event bus notifies subscribers of updates
 * 3. Plugins run concurrently, results merge progressively
 * 4. Caching per-plugin for performance
 */
export class SearchEngine {
  private readonly cache: KeyValueStorage<string, PluginSearchResult[]>;
  private readonly cacheTtlMs: number;

  constructor(options: SearchEngineOptions = {}) {
    this.cache =
      options.cache ??
      new KeyValueStorage<string, PluginSearchResult[]>({
        filename: "findr-cache.json",
      });
    this.cacheTtlMs = options.cacheTtlMs ?? 24 * 60 * 60 * 1000; // 24 hours
  }

  /**
   * Perform a search across all enabled plugins
   * Results stream via the event bus as each plugin completes
   */
  async search(query: string, options: SearchOptions = {}): Promise<SearchResponse> {
    const response: SearchResponse = { results: [], errors: [] };

    for await (const snapshot of this.searchStream(query, options)) {
      response.results = snapshot.results;
      response.errors = snapshot.errors;
    }

    return response;
  }

  /**
   * Search with streaming results via async generator
   * Each yield represents a new batch of results from a plugin
   */
  async *searchStream(
    query: string,
    options: SearchOptions = {},
  ): AsyncGenerator<SearchResponse, void, void> {
    const { signal, limit, sortOrder = "relevance" } = options;
    const enabledPlugins = PluginLoader.getEnabled();
    const startTime = Date.now();

    if (enabledPlugins.length === 0) {
      return;
    }

    const abortController = new AbortController();
    const { signal: controllerSignal } = abortController;
    const aggregator = new ResultAggregator();
    const errors: PluginSearchError[] = [];

    const handleExternalAbort = () => {
      abortController.abort(signal?.reason);
    };

    signal?.addEventListener("abort", handleExternalAbort);

    // Emit search started event
    await Bus.publish(SearchStarted, {
      query,
      enabledPlugins: enabledPlugins.map((p) => p.meta.id),
    });

    try {
      // Create tasks for each plugin
      const tasks = enabledPlugins.map((plugin, index) =>
        this.fetchPluginResults(plugin, query, limit, controllerSignal).then(
          (results) => ({
            status: "fulfilled" as const,
            index,
            results,
          }),
          (error: unknown) => ({
            status: "rejected" as const,
            index,
            error,
          }),
        ),
      );

      const pending = new Set(tasks);
      let completedCount = 0;

      // Process results as plugins complete
      while (pending.size > 0) {
        const settled = await Promise.race(pending);
        const original = tasks[settled.index]!;
        pending.delete(original);
        completedCount++;

        const plugin = enabledPlugins[settled.index]!;

        if (settled.status === "fulfilled") {
          // Add batch to aggregator
          aggregator.addResults(
            plugin.meta.id,
            plugin.meta.displayName,
            settled.results,
          );

          // Emit batch received event
          const batchResults = sortResults(aggregator.getResults(), sortOrder);
          await Bus.publish(SearchResultsBatch, {
            pluginId: plugin.meta.id,
            pluginDisplayName: plugin.meta.displayName,
            results: batchResults,
            isComplete: pending.size === 0,
          });
        } else {
          // Handle error
          const error =
            settled.error instanceof Error
              ? settled.error
              : new Error(String(settled.error));

          const pluginError: PluginSearchError = {
            pluginId: plugin.meta.id,
            pluginDisplayName: plugin.meta.displayName,
            error,
          };

          errors.push(pluginError);

          // Emit error event
          await Bus.publish(SearchPluginError, {
            pluginId: plugin.meta.id,
            pluginDisplayName: plugin.meta.displayName,
            error: error.message,
          });
        }

        // Get sorted aggregated results
        const aggregated = aggregator.getResults();
        const sorted = sortResults(aggregated, sortOrder);

        // Emit updated event
        await Bus.publish(SearchResultsUpdated, {
          results: sorted,
          totalPluginsCompleted: completedCount,
          totalPlugins: enabledPlugins.length,
        });

        // Yield snapshot
        yield {
          results: sorted,
          errors: [...errors],
        };
      }

      // Emit search completed event
      await Bus.publish(SearchCompleted, {
        query,
        totalResults: aggregator.size,
        errors: errors.map((e) => ({
          pluginId: e.pluginId,
          pluginDisplayName: e.pluginDisplayName,
          error: e.error.message,
        })),
        durationMs: Date.now() - startTime,
      });
    } catch (err) {
      if (signal?.aborted) {
        await Bus.publish(SearchCancelled, {
          query,
          reason: signal.reason?.toString(),
        });
      }
      throw err;
    } finally {
      signal?.removeEventListener("abort", handleExternalAbort);
    }
  }

  /**
   * Fetch results from a single plugin (with caching)
   */
  private async fetchPluginResults(
    plugin: PluginRegistration,
    query: string,
    limit: number | undefined,
    signal: AbortSignal,
  ): Promise<PluginSearchResult[]> {
    if (signal.aborted) {
      throw signal.reason ?? new Error("Search aborted");
    }

    // Check cache
    const cacheKey = this.getCacheKey(plugin.meta.id, query, limit);
    const cached = await this.getCached(cacheKey);
    if (cached) {
      return cached;
    }

    // Call plugin's search.before hook if available
    const queryOutput = { query };
    if (plugin.hooks["search.before"]) {
      await plugin.hooks["search.before"]({ query }, queryOutput);
    }

    // Execute search
    const rawResults = await plugin.hooks.search({
      query: queryOutput.query,
      signal,
      limit,
    });

    const results = Array.isArray(rawResults) ? rawResults : [];

    // Call plugin's search.after hook if available
    const resultsOutput = { results };
    if (plugin.hooks["search.after"]) {
      await plugin.hooks["search.after"](
        { query: queryOutput.query, results },
        resultsOutput,
      );
    }

    // Cache results
    await this.setCache(cacheKey, resultsOutput.results);

    return resultsOutput.results;
  }

  private getCacheKey(pluginId: string, query: string, limit: number | undefined): string {
    return `${pluginId}-${query}-${limit ?? ""}`;
  }

  private async getCached(key: string): Promise<PluginSearchResult[] | undefined> {
    try {
      return await this.cache.get(key);
    } catch {
      return undefined;
    }
  }

  private async setCache(key: string, results: PluginSearchResult[]): Promise<void> {
    try {
      await this.cache.set(key, results);
    } catch {
      // Ignore cache errors
    }
  }
}

// Singleton instance
let engineInstance: SearchEngine | null = null;

/**
 * Get the search engine instance
 */
export function useSearchEngine(): SearchEngine {
  if (!engineInstance) {
    engineInstance = new SearchEngine();
  }
  return engineInstance;
}

/**
 * Initialize the search engine (call once at startup)
 */
export async function initSearchEngine(): Promise<void> {
  await PluginLoader.init();
  if (!engineInstance) {
    engineInstance = new SearchEngine();
  }
}
