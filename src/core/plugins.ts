export interface SearchQuery {
  query: string;
  signal: AbortSignal;
  limit?: number;
}

export interface SearchResult {
  id?: string;
  title: string;
  description: string;
  url: string;
  score?: number;
  timestamp?: number;
  metadata?: Record<string, unknown>;
}

export interface AggregatedSearchResult extends SearchResult {
  id: string;
  pluginId: string;
  pluginDisplayName: string;
  receivedAt: number;
}

export interface SearchPlugin {
  id: string;
  displayName: string;
  description?: string;
  isEnabledByDefault?: boolean;
  search(query: SearchQuery): Promise<SearchResult[]>;
}

export interface PluginRegistration {
  plugin: SearchPlugin;
  enabled: boolean;
}

export interface PluginExecutionError {
  pluginId: string;
  pluginDisplayName: string;
  error: Error;
}

export interface AggregateSearchResponse {
  results: AggregatedSearchResult[];
  errors: PluginExecutionError[];
}

const createResultId = (pluginId: string, index: number) => {
  const suffix =
    typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : Date.now();
  return `${pluginId}-${index}-${suffix}`;
};

export class PluginManager {
  private readonly plugins = new Map<string, PluginRegistration>();

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

  list(): PluginRegistration[] {
    return Array.from(this.plugins.values()).sort((a, b) =>
      a.plugin.displayName.localeCompare(b.plugin.displayName),
    );
  }

  getPlugin(id: string): PluginRegistration | undefined {
    return this.plugins.get(id);
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
    return this.list()
      .filter((registration) => registration.enabled)
      .map((registration) => registration.plugin.id);
  }

  async search(
    query: string,
    options: { signal?: AbortSignal; limit?: number } = {},
  ): Promise<AggregateSearchResponse> {
    const enabledPlugins = this.list().filter((registration) => registration.enabled);
    if (enabledPlugins.length === 0) {
      return { results: [], errors: [] };
    }

    const abortController = new AbortController();
    const { signal: controllerSignal } = abortController;

    const handleExternalAbort = () => {
      abortController.abort(options.signal?.reason);
    };

    options.signal?.addEventListener("abort", handleExternalAbort);

    try {
      const settledResults = await Promise.allSettled(
        enabledPlugins.map(async (registration) => {
          const { plugin } = registration;
          const results = await plugin.search({
            query,
            signal: controllerSignal,
            limit: options.limit,
          });
          return { registration, results };
        }),
      );

      const receivedAt = Date.now();
      const aggregated: AggregatedSearchResult[] = [];
      const errors: PluginExecutionError[] = [];

      settledResults.forEach((settled, idx) => {
        const registration = enabledPlugins[idx];
        if (!registration) {
          return;
        }
        const { plugin } = registration;
        if (settled.status === "fulfilled") {
          settled.value.results.forEach((result, resultIndex) => {
            aggregated.push({
              ...result,
              id: result.id ?? createResultId(plugin.id, resultIndex),
              pluginId: plugin.id,
              pluginDisplayName: plugin.displayName,
              receivedAt,
            });
          });
        } else {
          errors.push({
            pluginId: plugin.id,
            pluginDisplayName: plugin.displayName,
            error:
              settled.reason instanceof Error ? settled.reason : new Error(String(settled.reason)),
          });
        }
      });

      return { results: aggregated, errors };
    } finally {
      options.signal?.removeEventListener("abort", handleExternalAbort);
    }
  }
}

export type { SearchPlugin as PluginDefinition };
