import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it, vi } from "bun:test";
import { KeyValueStorage } from "./keyValueStorage";
import { PluginManager, type SearchPlugin, type PluginSearchResult } from "./plugins";

const createPlugin = (
  id: string,
  implementation: (query: string, signal: AbortSignal) => Promise<PluginSearchResult[]>,
  options: { enabled?: boolean } = {},
): SearchPlugin => ({
  id,
  displayName: id,
  description: `${id} plugin`,
  isEnabledByDefault: options.enabled ?? true,
  async search({ query, signal }) {
    return implementation(query, signal);
  },
});

const createCache = async () => {
  const dir = await mkdtemp(join(tmpdir(), "findr-plugins-"));
  const path = join(dir, "cache.json");
  const cache = new KeyValueStorage<string, PluginSearchResult[]>({ path, ttlMs: 0 });
  return {
    cache,
    async cleanup() {
      await rm(dir, { recursive: true, force: true });
    },
  };
};

describe("PluginManager", () => {
  it("registers plugins and respects default enabled state", () => {
    const manager = new PluginManager();
    const enabled = createPlugin("alpha", async () => [], { enabled: true });
    const disabled = createPlugin("beta", async () => [], { enabled: false });

    manager.register(enabled);
    manager.register(disabled);

    expect(manager.isEnabled("alpha")).toBe(true);
    expect(manager.isEnabled("beta")).toBe(false);
  });

  it("returns grouped results and captures plugin errors", async () => {
    const manager = new PluginManager();
    const goodPlugin = createPlugin("good", async (query) => [
      {
        title: `Welcome ${query}`,
        description: "Greeting",
        url: "https://example.com/good",
      },
    ]);
    const badPlugin = createPlugin("bad", async () => {
      throw new Error("Nope");
    });

    manager.register(goodPlugin);
    manager.register(badPlugin);

    const response = await manager.search("friend");

    expect(response.results).toEqual([
      {
        pluginId: "good",
        pluginDisplayName: "good",
        results: [
          {
            title: "Welcome friend",
            description: "Greeting",
            url: "https://example.com/good",
          },
        ],
      },
    ]);

    expect(response.errors).toHaveLength(1);
    expect(response.errors[0]).toMatchObject({
      pluginId: "bad",
    });
  });

  it("ignores disabled plugins when searching", async () => {
    const manager = new PluginManager();
    const plugin = createPlugin("only", async () => [
      {
        title: "Hidden",
        description: "Should not be returned",
        url: "https://example.com/hidden",
      },
    ]);

    manager.register(plugin);
    manager.setEnabled("only", false);

    const response = await manager.search("anything");
    expect(response.results).toHaveLength(0);
  });

  it("returns cached results without invoking the plugin again", async () => {
    const { cache, cleanup } = await createCache();
    const manager = new PluginManager({ cache });
    const searchMock = vi.fn().mockResolvedValue([
      {
        title: "Cached",
        description: "From plugin",
        url: "https://example.com/cache",
      },
    ]);
    const plugin = createPlugin("cached", async (query, signal) => searchMock({ query, signal }));

    manager.register(plugin);

    try {
      const first = await manager.search("repeat");
      expect(first.results).toHaveLength(1);
      expect(searchMock).toHaveBeenCalledTimes(1);

      const second = await manager.search("repeat");
      expect(second.results).toHaveLength(1);
      expect(searchMock).toHaveBeenCalledTimes(1);
    } finally {
      await cleanup();
    }
  });

  it("records abort errors when a search is cancelled", async () => {
    const manager = new PluginManager();
    const abortSpy = vi.fn();

    const slowPlugin = createPlugin("slow", (_query, signal) => {
      return new Promise<PluginSearchResult[]>((resolve, reject) => {
        let timeoutId: ReturnType<typeof setTimeout> | null = null;

        const rejectWithReason = () => {
          abortSpy();
          if (timeoutId !== null) {
            clearTimeout(timeoutId);
          }
          reject(signal.reason ?? new Error("aborted"));
        };

        if (signal.aborted) {
          rejectWithReason();
          return;
        }

        timeoutId = setTimeout(() => {
          signal.removeEventListener("abort", rejectWithReason);
          resolve([]);
        }, 100);

        signal.addEventListener("abort", rejectWithReason, { once: true });
      });
    });

    manager.register(slowPlugin);

    const abortController = new AbortController();
    const searchPromise = manager.search("query", { signal: abortController.signal });
    abortController.abort(new Error("cancelled"));

    const response = await searchPromise;
    expect(response.results).toHaveLength(0);
    expect(response.errors).toHaveLength(1);
    expect(response.errors[0]?.pluginId).toBe("slow");
    expect(abortSpy).toHaveBeenCalledTimes(1);
  });
});
