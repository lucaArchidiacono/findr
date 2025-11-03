import {
  PluginManager,
  type PluginSearchError,
  type PluginSearchResult,
  type SearchPlugin,
} from "./plugins";
import { KeyValueStorage } from "./keyValueStorage";
import plugins from "../plugins";

const createResultId = (index: number) => {
  const suffix =
    typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : Date.now();
  return `${index}-${suffix}`;
};

export interface SearchResult extends PluginSearchResult {
  id: string;
  pluginIds: string[];
  pluginDisplayNames: string[];
  receivedAt: number;
}

export interface SearchResponse {
  results: SearchResult[];
  errors: PluginSearchError[];
}

export type SortOrder = "relevance" | "recency" | "source";

export interface SearchOptions {
  signal?: AbortSignal;
  limit?: number;
  sortOrder?: SortOrder;
}

export interface BackendOptions {
  cache?: KeyValueStorage<string, PluginSearchResult[]>;
}

const scoreFallback = (result: SearchResult) => {
  return typeof result.score === "number" ? result.score : 0;
};

const timestampFallback = (result: SearchResult) => {
  return typeof result.timestamp === "number" ? result.timestamp : result.receivedAt;
};

const sortResults = (results: SearchResult[], order: SortOrder): SearchResult[] => {
  switch (order) {
    case "recency":
      return [...results].sort(
        (a, b) =>
          timestampFallback(b) - timestampFallback(a) || scoreFallback(b) - scoreFallback(a),
      );
    case "source":
      return [...results].sort((a, b) => {
        const pluginCountDiff = b.pluginIds.length - a.pluginIds.length;
        if (pluginCountDiff !== 0) {
          return pluginCountDiff;
        }
        const byPluginIds = a.pluginIds.join(", ").localeCompare(b.pluginIds.join(", "));
        if (byPluginIds !== 0) {
          return byPluginIds;
        }
        return scoreFallback(b) - scoreFallback(a);
      });
    case "relevance":
    default:
      return [...results].sort((a, b) => {
        const pluginCountDiff = b.pluginIds.length - a.pluginIds.length;
        if (pluginCountDiff !== 0) {
          return pluginCountDiff;
        }
        const byScore = scoreFallback(b) - scoreFallback(a);
        if (byScore !== 0) {
          return byScore;
        }
        return timestampFallback(b) - timestampFallback(a);
      });
  }
};

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

class ResultAggregator {
  private readonly entries = new Map<string, AggregatedEntry>();

  addResults(
    pluginId: string,
    pluginDisplayName: string,
    results: PluginSearchResult[] | undefined,
  ) {
    if (!Array.isArray(results) || results.length === 0) {
      return;
    }

    for (const result of results) {
      if (!result) {
        continue;
      }

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

      const insertIndex = entry.pluginEntries.findIndex((existing) =>
        pluginId.localeCompare(existing.pluginId) > 0,
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
      const pluginIds = entry.pluginEntries.map((value) => value.pluginId);
      const pluginDisplayNames = entry.pluginEntries.map((value) => value.pluginDisplayName);

      const result: SearchResult = {
        ...entry.combined,
        ...(typeof combinedScore === "number" ? { score: combinedScore } : {}),
        id: createResultId(index),
        pluginIds,
        pluginDisplayNames,
        receivedAt,
      };

      return result;
    });
  }

  private buildCombinedResult(entries: AggregatedPluginEntry[]): PluginSearchResult {
    if (entries.length === 0) {
      return {} as PluginSearchResult;
    }

    const [first, ...rest] = entries;
    const combined: PluginSearchResult = { ...first.result };

    for (const { result } of rest) {
      Object.assign(combined, result);
    }

    return combined;
  }
}

export class Backend {
  private readonly pluginManager: PluginManager;
  private readonly pluginResultCache: KeyValueStorage<string, PluginSearchResult[]>;

  constructor(pluginDefinitions: SearchPlugin[] = plugins, options: BackendOptions = {}) {
    this.pluginManager = new PluginManager();
    this.pluginResultCache =
      options.cache ??
      new KeyValueStorage<string, PluginSearchResult[]>({
        filename: "findr-cache.json",
      });
    pluginDefinitions.forEach((plugin) => {
      this.pluginManager.register(plugin);
    });
  }

  async search(query: string, options: SearchOptions = {}): Promise<SearchResponse> {
    const response: SearchResponse = { results: [], errors: [] };

    for await (const snapshot of this.searchStream(query, options)) {
      response.results = snapshot.results;
      response.errors = snapshot.errors;
    }

    return response;
  }

  async *searchStream(
    query: string,
    options: SearchOptions = {},
  ): AsyncGenerator<SearchResponse, void, void> {
    const { signal, limit, sortOrder = "relevance" } = options;
    const enabledPlugins = this.pluginManager.getEnabledPlugins();

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

    try {
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

      while (pending.size > 0) {
        const settled = await Promise.race(pending);
        const original = tasks[settled.index]!;
        pending.delete(original);
        const plugin = enabledPlugins[settled.index]!;

        if (settled.status === "fulfilled") {
          aggregator.addResults(plugin.id, plugin.displayName, settled.results);
        } else {
          const error =
            settled.error instanceof Error ? settled.error : new Error(String(settled.error));
          errors.push({
            pluginId: plugin.id,
            pluginDisplayName: plugin.displayName,
            error,
          });
        }

        const aggregated = aggregator.getResults();
        const sorted = sortResults(aggregated, sortOrder);
        yield {
          results: sorted,
          errors: [...errors],
        };
      }
    } finally {
      signal?.removeEventListener("abort", handleExternalAbort);
    }
  }

  getEnabledPluginIds() {
    return this.pluginManager.getEnabledPluginIds();
  }

  getPlugins() {
    return this.pluginManager.list();
  }

  getPlugin(id: string) {
    return this.pluginManager.getPlugin(id);
  }

  setPluginEnabled(id: string, enabled: boolean) {
    return this.pluginManager.setEnabled(id, enabled);
  }

  togglePlugin(id: string) {
    return this.pluginManager.toggle(id);
  }

  private async fetchPluginResults(
    plugin: SearchPlugin,
    query: string,
    limit: number | undefined,
    signal: AbortSignal,
  ): Promise<PluginSearchResult[]> {
    if (signal.aborted) {
      throw signal.reason ?? new Error("Search aborted");
    }

    const cached = await this.getCachedPluginResults(plugin.id, query, limit);
    if (cached) {
      return cached;
    }

    const rawResults = await plugin.search({
      query,
      signal,
      limit,
    });

    const results = Array.isArray(rawResults) ? rawResults : [];

    await this.storePluginResultsInCache(plugin.id, plugin.displayName, query, limit, results);

    return results;
  }

  private async getCachedPluginResults(
    pluginId: string,
    query: string,
    limit: number | undefined,
  ): Promise<PluginSearchResult[] | undefined> {
    try {
      return await this.pluginResultCache.get(this.getCacheKey(pluginId, query, limit));
    } catch (error) {
      console.warn(
        `Failed to read cache for plugin "${pluginId}":`,
        error instanceof Error ? error.message : String(error),
      );
      return undefined;
    }
  }

  private async storePluginResultsInCache(
    pluginId: string,
    pluginDisplayName: string,
    query: string,
    limit: number | undefined,
    results: PluginSearchResult[],
  ): Promise<void> {
    try {
      await this.pluginResultCache.set(this.getCacheKey(pluginId, query, limit), results);
    } catch (error) {
      console.warn(
        `Failed to update cache for plugin "${pluginDisplayName}":`,
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  private getCacheKey(pluginId: string, query: string, limit: number | undefined): string {
    return `${pluginId}-${query}-${limit ?? ""}`;
  }
}

const backend = new Backend();

export const useBackend = () => {
  return backend;
};
