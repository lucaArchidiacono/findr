import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it, vi } from "vitest";
import { PluginManager, type SearchPlugin } from "./plugins";
import SearchCache from "./keyValueStorage";

const createStubPlugin = (
  id: string,
  results: { title: string; description: string; url: string }[],
  options: { enabled?: boolean; fail?: boolean } = {},
): SearchPlugin => ({
  id,
  displayName: id,
  isEnabledByDefault: options.enabled ?? true,
  description: `Plugin ${id}`,
  async search({ query }) {
    if (options.fail) {
      throw new Error(`Plugin ${id} failed`);
    }
    return results.map((entry, index) => ({
      ...entry,
      id: `${id}-${index}`,
      description: `${entry.description} (${query})`,
    }));
  },
});

describe("PluginManager", () => {
  it("registers plugins and respects default enabled state", () => {
    const manager = new PluginManager();
    const alpha = createStubPlugin("alpha", [], { enabled: true });
    const beta = createStubPlugin("beta", [], { enabled: false });

    manager.register(alpha);
    manager.register(beta);

    expect(manager.isEnabled("alpha")).toBe(true);
    expect(manager.isEnabled("beta")).toBe(false);
  });

  it("toggles plugin enabled state", () => {
    const manager = new PluginManager();
    const plugin = createStubPlugin("toggle", [], { enabled: true });
    manager.register(plugin);

    expect(manager.isEnabled("toggle")).toBe(true);
    const disabled = manager.toggle("toggle");
    expect(disabled).toBe(false);
    expect(manager.isEnabled("toggle")).toBe(false);

    const enabled = manager.toggle("toggle");
    expect(enabled).toBe(true);
    expect(manager.isEnabled("toggle")).toBe(true);
  });

  it("aggregates results and captures plugin errors", async () => {
    const manager = new PluginManager();
    const successPlugin = createStubPlugin("success", [
      {
        title: "Result A",
        description: "First result",
        url: "https://example.com/a",
      },
    ]);
    const failingPlugin = createStubPlugin(
      "failure",
      [
        {
          title: "Result B",
          description: "Second result",
          url: "https://example.com/b",
        },
      ],
      { fail: true },
    );

    manager.register(successPlugin);
    manager.register(failingPlugin);

    const response = await manager.search("test");

    expect(response.results).toHaveLength(1);
    expect(response.results[0]).toMatchObject({
      pluginId: "success",
      title: "Result A",
    });
    expect(response.errors).toHaveLength(1);
    expect(response.errors[0]).toMatchObject({
      pluginId: "failure",
    });
  });

  it("aborts in-flight searches", async () => {
    const manager = new PluginManager();
    const abortSpy = vi.fn();

    const slowPlugin: SearchPlugin = {
      id: "slow",
      displayName: "Slow",
      async search({ signal }) {
        return new Promise((resolve, reject) => {
          signal.addEventListener("abort", () => {
            abortSpy();
            reject(signal.reason ?? new Error("aborted"));
          });
          setTimeout(() => resolve([]), 100);
        });
      },
    };

    manager.register(slowPlugin);

    const abortController = new AbortController();
    const promise = manager.search("query", { signal: abortController.signal });
    abortController.abort();

    const response = await promise;
    expect(response.results).toHaveLength(0);
    expect(response.errors).toHaveLength(1);
    expect(response?.errors?.[0]?.pluginId).toBe("slow");
    expect(abortSpy).toHaveBeenCalledOnce();
  });

  it("returns cached results when available", async () => {
    const dir = await mkdtemp(join(tmpdir(), "findr-cache-"));
    const cachePath = join(dir, "cache.json");
    const cache = new SearchCache({ path: cachePath, ttlMs: 0 });
    const searchMock = vi.fn().mockResolvedValue([
      {
        title: "Cached result",
        description: "From plugin",
        url: "https://example.com/cached",
      },
    ]);

    const manager = new PluginManager({ cache });
    const plugin: SearchPlugin = {
      id: "cached",
      displayName: "Cached Plugin",
      async search(args) {
        return searchMock(args);
      },
    };

    manager.register(plugin);

    try {
      const first = await manager.search("repeat");
      expect(first.results).toHaveLength(1);
      expect(searchMock).toHaveBeenCalledTimes(1);

      const second = await manager.search("repeat");
      expect(second.results).toHaveLength(1);
      expect(searchMock).toHaveBeenCalledTimes(1);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
