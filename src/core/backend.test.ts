import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it, vi } from "bun:test";
import { Backend } from "./backend";
import { KeyValueStorage } from "./keyValueStorage";
import type { PluginSearchResult, SearchPlugin } from "./plugins";

const createTestPlugin = (
  id: string,
  implementation: (query: string, signal: AbortSignal) => Promise<PluginSearchResult[]>,
  options: { displayName?: string } = {},
): SearchPlugin => ({
  id,
  displayName: options.displayName ?? id,
  description: `${id} plugin`,
  async search({ query, signal }) {
    return implementation(query, signal);
  },
});

const setupBackend = async (plugins: SearchPlugin[]) => {
  const dir = await mkdtemp(join(tmpdir(), "findr-backend-"));
  const cachePath = join(dir, "cache.json");
  const cache = new KeyValueStorage<string, PluginSearchResult[]>({ path: cachePath, ttlMs: 0 });
  const backend = new Backend(plugins, { cache });
  return {
    backend,
    async cleanup() {
      await rm(dir, { recursive: true, force: true });
    },
  };
};

const collectUrls = (response: { results: { url: string }[] }) =>
  response.results.map((result) => result.url);

describe("Backend search", () => {
  it("aggregates plugin results and supports sort orders", async () => {
    const alphaResults: PluginSearchResult[] = [
      {
        title: "Shared Alpha",
        description: "Alpha shared",
        url: "https://example.com/shared",
        score: 5,
        timestamp: 50,
      },
      {
        title: "Alpha Only",
        description: "Alpha specific",
        url: "https://example.com/alpha",
        score: 1,
        timestamp: 100,
      },
    ];

    const betaResults: PluginSearchResult[] = [
      {
        title: "Shared Beta",
        description: "Beta shared",
        url: "https://example.com/shared",
        score: 3,
        timestamp: 75,
      },
      {
        title: "Beta Only",
        description: "Beta specific",
        url: "https://example.com/beta",
        score: 10,
        timestamp: 200,
      },
    ];

    const alphaSearch = vi.fn(async () => alphaResults);
    const betaSearch = vi.fn(async () => betaResults);

    const alpha = createTestPlugin("alpha", () => alphaSearch());
    const beta = createTestPlugin("beta", () => betaSearch());

    const { backend, cleanup } = await setupBackend([alpha, beta]);

    try {
      const relevanceResponse = await backend.search("query");

      expect(alphaSearch).toHaveBeenCalledTimes(1);
      expect(betaSearch).toHaveBeenCalledTimes(1);

      expect(collectUrls(relevanceResponse)).toEqual([
        "https://example.com/shared",
        "https://example.com/beta",
        "https://example.com/alpha",
      ]);

      const shared = relevanceResponse.results.find(
        (result) => result.url === "https://example.com/shared",
      );
      expect(shared?.pluginIds.sort()).toEqual(["alpha", "beta"]);
      expect(shared?.score).toBe(8);

      const recencyResponse = await backend.search("query", { sortOrder: "recency" });
      expect(alphaSearch).toHaveBeenCalledTimes(1);
      expect(betaSearch).toHaveBeenCalledTimes(1);

      expect(collectUrls(recencyResponse)).toEqual([
        "https://example.com/beta",
        "https://example.com/alpha",
        "https://example.com/shared",
      ]);
    } finally {
      await cleanup();
    }
  });

  it("uses cached plugin results for repeated searches", async () => {
    const searchMock = vi.fn(async () => [
      {
        title: "Cached Result",
        description: "From cache",
        url: "https://example.com/cache",
        score: 1,
      },
    ]);

    const plugin = createTestPlugin("cached", () => searchMock());
    const { backend, cleanup } = await setupBackend([plugin]);

    try {
      const first = await backend.search("repeat");
      const second = await backend.search("repeat");

      expect(first.results).toHaveLength(1);
      expect(second.results).toHaveLength(1);
      expect(searchMock).toHaveBeenCalledTimes(1);
    } finally {
      await cleanup();
    }
  });

  it("streams incremental results using the requested sort order", async () => {
    const fastSearch = vi.fn(async () => [
      {
        title: "Fast Result",
        description: "First to arrive",
        url: "https://example.com/shared",
        score: 1,
        timestamp: 10,
      },
    ]);

    const slowSearch = vi.fn(
      () =>
        new Promise<PluginSearchResult[]>((resolve) => {
          setTimeout(() => {
            resolve([
              {
                title: "Slow Result",
                description: "Second to arrive",
                url: "https://example.com/shared",
                score: 2,
                timestamp: 20,
              },
            ]);
          }, 25);
        }),
    );

    const fast = createTestPlugin("alpha", () => fastSearch());
    const slow = createTestPlugin("beta", () => slowSearch());

    const { backend, cleanup } = await setupBackend([fast, slow]);

    try {
      const iterator = backend.searchStream("query", { sortOrder: "source" });

      const first = await iterator.next();
      expect(first.done).toBe(false);
      expect(first.value?.results).toHaveLength(1);
      expect(first.value?.results[0]?.pluginIds).toEqual(["alpha"]);

      const second = await iterator.next();
      expect(second.done).toBe(false);
      expect(second.value?.results).toHaveLength(1);
      expect(second.value?.results[0]?.pluginIds.sort()).toEqual(["alpha", "beta"]);

      const final = await iterator.next();
      expect(final.done).toBe(true);
    } finally {
      await cleanup();
    }
  });
});
