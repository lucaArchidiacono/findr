import {
  PluginManager,
  type PluginSearchError,
  type PluginSearchResultGroup,
  type PluginSearchResult,
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

const aggregatePluginResults = (groups: PluginSearchResultGroup[]): SearchResult[] => {
  const aggregated = new Map<
    string,
    (PluginSearchResult & { pluginId: string; pluginDisplayName: string })[]
  >();

  groups.forEach(({ pluginId, pluginDisplayName, results }) => {
    results.forEach((result) => {
      if (!result) {
        return;
      }

      const key = result.url;
      let pluginResults = aggregated.get(key);
      if (!pluginResults) {
        pluginResults = [];
        aggregated.set(key, pluginResults);
      }

      pluginResults.push({
        ...result,
        pluginId,
        pluginDisplayName,
      });
    });
  });

  const receivedAt = Date.now();
  return Array.from(aggregated.values())
    .map((values, index) => {
      if (values.length <= 0) {
        return undefined;
      }

      values.sort((a, b) => b.pluginId.localeCompare(a.pluginId));
      const baseCombine = Object.assign({}, ...values);
      const totalScore = values.reduce(
        (sum, curr) => sum + (typeof curr.score === "number" ? curr.score : 0),
        0,
      );
      const combined = {
        ...baseCombine,
        ...(values.some((v) => typeof v.score === "number") ? { score: totalScore } : {}),
      };

      return {
        ...combined,
        id: createResultId(index),
        pluginIds: values.map((value) => value.pluginId),
        pluginDisplayNames: values.map((value) => value.pluginDisplayName),
        receivedAt,
      } as SearchResult;
    })
    .filter((value): value is SearchResult => Boolean(value));
};

class Backend {
  private readonly pluginManager: PluginManager;

  constructor() {
    this.pluginManager = new PluginManager({
      cache: new KeyValueStorage<string, PluginSearchResult[]>({ filename: "findr-cache.json" }),
    });
    plugins.forEach((plugin) => {
      this.pluginManager.register(plugin);
    });
  }

  async search(
    query: string,
    options: { signal?: AbortSignal; limit?: number } = {},
  ): Promise<SearchResponse> {
    let latest: SearchResponse = { results: [], errors: [] };

    for await (const response of this.searchStream(query, options)) {
      latest = response;
    }

    return latest;
  }

  async *searchStream(
    query: string,
    options: { signal?: AbortSignal; limit?: number } = {},
  ): AsyncGenerator<SearchResponse, SearchResponse, void> {
    let latest: SearchResponse = { results: [], errors: [] };

    for await (const snapshot of this.pluginManager.searchStream(query, options)) {
      latest = {
        results: aggregatePluginResults(snapshot.results),
        errors: snapshot.errors,
      };
      yield latest;
    }

    return latest;
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
}

const backend = new Backend();

export const useBackend = () => {
  return backend;
};
