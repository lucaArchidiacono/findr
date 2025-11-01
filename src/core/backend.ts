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
    const iterator = this.searchStream(query, options);
    let latest: SearchResponse = { results: [], errors: [] };

    while (true) {
      const { value, done } = await iterator.next();
      if (done) {
        if (value) {
          return value;
        }
        return latest;
      }

      latest = value;
    }
  }

  async *searchStream(
    query: string,
    options: { signal?: AbortSignal; limit?: number } = {},
  ): AsyncGenerator<SearchResponse, SearchResponse, void> {
    const pluginIterator = this.pluginManager.searchStream(query, options);
    let hasYielded = false;

    while (true) {
      const { value, done } = await pluginIterator.next();
      if (done) {
        const finalValue = value ?? { results: [], errors: [] };
        if (!hasYielded) {
          const aggregatedResults = aggregatePluginResults(finalValue.results);
          const response: SearchResponse = {
            results: aggregatedResults,
            errors: finalValue.errors,
          };
          hasYielded = true;
          yield response;
          return response;
        }
        return {
          results: aggregatePluginResults(finalValue.results),
          errors: finalValue.errors,
        };
      }

      const aggregatedResults = aggregatePluginResults(value.results);
      const response: SearchResponse = {
        results: aggregatedResults,
        errors: value.errors,
      };
      hasYielded = true;
      yield response;
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
}

const backend = new Backend();

export const useBackend = () => {
  return backend;
};
