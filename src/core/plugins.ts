import type KeyValueStorage from "./keyValueStorage";

export interface PluginSearchQuery {
  query: string;
  signal: AbortSignal;
  limit?: number;
}

export interface PluginSearchResult {
  id?: string;
  title: string;
  description: string;
  url: string;
  score?: number;
  timestamp?: number;
  metadata?: Record<string, unknown>;
}

export interface SearchPlugin {
  id: string;
  displayName: string;
  description?: string;
  isEnabledByDefault?: boolean;
  search(query: PluginSearchQuery): Promise<PluginSearchResult[]>;
}

export interface PluginRegistration {
  plugin: SearchPlugin;
  enabled: boolean;
}

export interface PluginSearchError {
  pluginId: string;
  pluginDisplayName: string;
  error: Error;
}

export interface PluginSearchResultGroup {
  pluginId: string;
  pluginDisplayName: string;
  results: PluginSearchResult[];
}

export interface PluginSearchResponse {
  results: PluginSearchResultGroup[];
  errors: PluginSearchError[];
}

export interface PluginManagerOptions {
  cache?: KeyValueStorage;
}

export class PluginManager {
  private readonly plugins = new Map<string, PluginRegistration>();
  private readonly cache?: KeyValueStorage;

  constructor(options: PluginManagerOptions = {}) {
    this.cache = options.cache;
  }

  register(plugin: SearchPlugin): void {
    if (this.plugins.has(plugin.id)) {
      throw new Error(`Plugin with id "${plugin.id}" is already registered.`);
    }

    const enabledByDefault = plugin.isEnabledByDefault ?? true;
    this.plugins.set(plugin.id, {
      plugin,
      enabled: enabledByDefault,
    });
  }

  list(): SearchPlugin[] {
    return Array.from(this.plugins.values())
      .sort((a, b) => a.plugin.id.localeCompare(b.plugin.id))
      .map((registration) => registration.plugin);
  }

  getPlugin(id: string): SearchPlugin | undefined {
    return this.plugins.get(id)?.plugin;
  }

  isEnabled(id: string): boolean {
    const registration = this.plugins.get(id);
    return registration ? registration.enabled : false;
  }

  setEnabled(id: string, enabled: boolean): void {
    const registration = this.plugins.get(id);
    if (!registration) {
      throw new Error(`Unknown plugin: ${id}`);
    }
    registration.enabled = enabled;
  }

  toggle(id: string): boolean {
    const registration = this.plugins.get(id);
    if (!registration) {
      throw new Error(`Unknown plugin: ${id}`);
    }
    registration.enabled = !registration.enabled;
    return registration.enabled;
  }

  setEnabledPlugins(pluginIds: string[]): void {
    const desired = new Set(pluginIds);
    for (const [id, registration] of this.plugins.entries()) {
      registration.enabled = desired.has(id);
    }
  }

  getEnabledPluginIds(): string[] {
    return this.getEnabledPlugins().map((plugin) => plugin.id);
  }

  getEnabledPlugins(): SearchPlugin[] {
    return Array.from(this.plugins.values())
      .filter((registration) => registration.enabled)
      .map((registration) => registration.plugin);
  }

  async search(
    query: string,
    options: { signal?: AbortSignal; limit?: number } = {},
  ): Promise<PluginSearchResponse> {
    const collected: PluginSearchResponse = { results: [], errors: [] };

    for await (const snapshot of this.searchStream(query, options)) {
      collected.results = snapshot.results;
      collected.errors = snapshot.errors;
    }

    return collected;
  }

  async *searchStream(
    query: string,
    options: { signal?: AbortSignal; limit?: number } = {},
  ): AsyncGenerator<PluginSearchResponse, void, void> {
    const enabledPlugins = this.getEnabledPlugins();
    if (enabledPlugins.length === 0) {
      return;
    }

    const abortController = new AbortController();
    const { signal: controllerSignal } = abortController;

    const handleExternalAbort = () => {
      abortController.abort(options.signal?.reason);
    };

    options.signal?.addEventListener("abort", handleExternalAbort);

    try {
      const tasks = enabledPlugins.map((plugin, index) =>
        this.fetchPluginResults(plugin, query, options.limit, controllerSignal).then(
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
      const snapshot: PluginSearchResponse = { results: [], errors: [] };

      while (pending.size > 0) {
        const settled = await Promise.race(pending);
        const original = tasks[settled.index]!;
        pending.delete(original);
        const plugin = enabledPlugins[settled.index]!;

        if (settled.status === "fulfilled") {
          snapshot.results.push({
            pluginId: plugin.id,
            pluginDisplayName: plugin.displayName,
            results: settled.results ?? [],
          });
        } else {
          const error =
            settled.error instanceof Error ? settled.error : new Error(String(settled.error));
          snapshot.errors.push({
            pluginId: plugin.id,
            pluginDisplayName: plugin.displayName,
            error,
          });
        }

        yield snapshot;
      }

      return;
    } finally {
      options.signal?.removeEventListener("abort", handleExternalAbort);
    }
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

    const cached = await this.getCachedResults(plugin.id, query, limit);
    if (cached) {
      return cached;
    }

    const rawResults = await plugin.search({
      query,
      signal,
      limit,
    });

    const results = Array.isArray(rawResults) ? rawResults : [];

    if (this.cache) {
      await this.storeResultsInCache(plugin.id, query, limit, results);
    }

    return results;
  }

  private async getCachedResults(
    pluginId: string,
    query: string,
    limit: number | undefined,
  ): Promise<PluginSearchResult[] | undefined> {
    if (!this.cache) {
      return undefined;
    }

    try {
      return (await this.cache.get(`${pluginId}-${query}-${limit ?? ""}`)) as
        | PluginSearchResult[]
        | undefined;
    } catch (error) {
      console.warn(
        `Failed to read cache for plugin "${pluginId}":`,
        error instanceof Error ? error.message : String(error),
      );
      return undefined;
    }
  }

  private async storeResultsInCache(
    pluginId: string,
    query: string,
    limit: number | undefined,
    results: PluginSearchResult[],
  ): Promise<void> {
    if (!this.cache) {
      return;
    }

    try {
      await this.cache.set(`${pluginId}-${query}-${limit ?? ""}`, results);
    } catch (error) {
      console.warn(
        `Failed to update cache for plugin "${pluginId}":`,
        error instanceof Error ? error.message : String(error),
      );
    }
  }
}

export type { SearchPlugin as PluginDefinition };
