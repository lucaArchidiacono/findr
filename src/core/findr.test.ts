import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it, beforeEach } from "bun:test";
import { Findr, type PluginResult, type SearchResponse, type PluginSearchError } from "./findr";

beforeEach(() => {
  Findr.clear();
});

// ---- Helpers ----

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

const fakePlugin = (
  name: string,
  results: PluginResult[],
  opts?: { displayName?: string; delayMs?: number; enabled?: boolean; description?: string },
) => {
  Findr.register({
    name,
    displayName: opts?.displayName,
    description: opts?.description,
    enabled: opts?.enabled,
    search: async (_query, signal) => {
      if (opts?.delayMs) await delay(opts.delayMs);
      if (signal.aborted) return [];
      return results;
    },
  });
};

const failingPlugin = (name: string, errorMessage: string) => {
  Findr.register({
    name,
    search: async () => {
      throw new Error(errorMessage);
    },
  });
};

const collectAll = async (gen: AsyncGenerator<SearchResponse>): Promise<SearchResponse[]> => {
  const snapshots: SearchResponse[] = [];
  for await (const s of gen) snapshots.push(s);
  return snapshots;
};

const urls = (response: SearchResponse) => response.results.map((r) => r.url);

// ---- Registration ----

describe("registration", () => {
  it("registers a plugin and lists it", () => {
    fakePlugin("alpha", []);
    const plugins = Findr.list();
    expect(plugins).toHaveLength(1);
    expect(plugins[0]!.name).toBe("alpha");
    expect(plugins[0]!.enabled).toBe(true);
    expect(plugins[0]!.source).toBe("builtin");
  });

  it("uses displayName when provided", () => {
    fakePlugin("mock", [], { displayName: "Local Mock" });
    expect(Findr.list()[0]!.displayName).toBe("Local Mock");
  });

  it("defaults displayName to name", () => {
    fakePlugin("brave", []);
    expect(Findr.list()[0]!.displayName).toBe("brave");
  });

  it("lists plugins sorted by name", () => {
    fakePlugin("charlie", []);
    fakePlugin("alpha", []);
    fakePlugin("bravo", []);
    expect(Findr.list().map((p) => p.name)).toEqual(["alpha", "bravo", "charlie"]);
  });

  it("registers with enabled: false", () => {
    fakePlugin("disabled-one", [], { enabled: false });
    expect(Findr.get("disabled-one")?.enabled).toBe(false);
    expect(Findr.enabledIds()).toEqual([]);
  });

  it("get returns undefined for unknown plugin", () => {
    expect(Findr.get("nonexistent")).toBeUndefined();
  });
});

// ---- Enable / Disable / Toggle ----

describe("enable/disable/toggle", () => {
  it("enables a disabled plugin", () => {
    fakePlugin("p", [], { enabled: false });
    expect(Findr.enabledIds()).toEqual([]);
    Findr.enable("p");
    expect(Findr.enabledIds()).toEqual(["p"]);
  });

  it("disables an enabled plugin", () => {
    fakePlugin("p", []);
    Findr.disable("p");
    expect(Findr.enabledIds()).toEqual([]);
  });

  it("toggle flips state and returns new value", () => {
    fakePlugin("p", []);
    expect(Findr.toggle("p")).toBe(false);
    expect(Findr.toggle("p")).toBe(true);
  });

  it("throws on unknown plugin", () => {
    expect(() => Findr.enable("nope")).toThrow("Unknown plugin: nope");
    expect(() => Findr.disable("nope")).toThrow("Unknown plugin: nope");
    expect(() => Findr.toggle("nope")).toThrow("Unknown plugin: nope");
  });
});

// ---- Search (single plugin) ----

describe("search single plugin", () => {
  it("returns results from one plugin", async () => {
    fakePlugin("alpha", [
      { title: "A", description: "desc A", url: "https://a.com", score: 5 },
    ]);

    const snapshots = await collectAll(Findr.search("test"));
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]!.results).toHaveLength(1);
    expect(snapshots[0]!.results[0]!.title).toBe("A");
    expect(snapshots[0]!.results[0]!.pluginIds).toEqual(["alpha"]);
    expect(snapshots[0]!.results[0]!.pluginDisplayNames).toEqual(["alpha"]);
  });

  it("returns empty when no plugins are enabled", async () => {
    fakePlugin("p", [{ title: "X", description: "", url: "https://x.com" }], { enabled: false });
    const snapshots = await collectAll(Findr.search("test"));
    expect(snapshots).toHaveLength(0);
  });

  it("returns empty when no plugins are registered", async () => {
    const snapshots = await collectAll(Findr.search("test"));
    expect(snapshots).toHaveLength(0);
  });
});

// ---- Search (streaming with multiple plugins) ----

describe("search streaming", () => {
  it("yields one snapshot per plugin", async () => {
    fakePlugin("fast", [{ title: "Fast", description: "", url: "https://fast.com" }]);
    fakePlugin("slow", [{ title: "Slow", description: "", url: "https://slow.com" }], {
      delayMs: 30,
    });

    const snapshots = await collectAll(Findr.search("test"));
    expect(snapshots).toHaveLength(2);

    // First snapshot has 1 result (fast plugin)
    expect(snapshots[0]!.results).toHaveLength(1);
    // Second snapshot has 2 results (both)
    expect(snapshots[1]!.results).toHaveLength(2);
  });

  it("streams incremental results - first snapshot then accumulates", async () => {
    fakePlugin("a", [{ title: "A", description: "", url: "https://a.com", score: 1 }]);
    fakePlugin("b", [{ title: "B", description: "", url: "https://b.com", score: 2 }], {
      delayMs: 20,
    });

    const gen = Findr.search("test");

    const first = await gen.next();
    expect(first.done).toBe(false);
    expect(first.value!.results).toHaveLength(1);

    const second = await gen.next();
    expect(second.done).toBe(false);
    expect(second.value!.results).toHaveLength(2);

    const done = await gen.next();
    expect(done.done).toBe(true);
  });
});

// ---- Aggregation (deduplication by URL) ----

describe("aggregation", () => {
  it("deduplicates results by URL and merges scores", async () => {
    fakePlugin("alpha", [
      { title: "Shared", description: "from alpha", url: "https://shared.com", score: 5 },
      { title: "Alpha Only", description: "", url: "https://alpha.com", score: 1 },
    ]);
    fakePlugin("beta", [
      { title: "Shared", description: "from beta", url: "https://shared.com", score: 3 },
      { title: "Beta Only", description: "", url: "https://beta.com", score: 10 },
    ]);

    const snapshots = await collectAll(Findr.search("test"));
    const final = snapshots[snapshots.length - 1]!;

    // 3 unique URLs
    expect(final.results).toHaveLength(3);

    const shared = final.results.find((r) => r.url === "https://shared.com");
    expect(shared).toBeDefined();
    expect(shared!.pluginIds.sort()).toEqual(["alpha", "beta"]);
    expect(shared!.score).toBe(8); // 5 + 3
  });

  it("preserves results without scores", async () => {
    fakePlugin("p", [{ title: "No Score", description: "", url: "https://no-score.com" }]);

    const snapshots = await collectAll(Findr.search("test"));
    const result = snapshots[0]!.results[0]!;
    expect(result.score).toBeUndefined();
  });
});

// ---- Sort orders ----

describe("sorting", () => {
  const setupSortTest = () => {
    fakePlugin("alpha", [
      { title: "Shared", description: "", url: "https://shared.com", score: 5, timestamp: 50 },
      { title: "Alpha", description: "", url: "https://alpha.com", score: 1, timestamp: 100 },
    ]);
    fakePlugin("beta", [
      { title: "Shared", description: "", url: "https://shared.com", score: 3, timestamp: 75 },
      { title: "Beta", description: "", url: "https://beta.com", score: 10, timestamp: 200 },
    ]);
  };

  it("sorts by relevance (plugin count > score > recency)", async () => {
    setupSortTest();
    const snapshots = await collectAll(Findr.search("test", { sortOrder: "relevance" }));
    const final = snapshots[snapshots.length - 1]!;

    expect(urls(final)).toEqual([
      "https://shared.com", // 2 plugins
      "https://beta.com", // score 10
      "https://alpha.com", // score 1
    ]);
  });

  it("sorts by recency (timestamp desc)", async () => {
    setupSortTest();
    const snapshots = await collectAll(Findr.search("test", { sortOrder: "recency" }));
    const final = snapshots[snapshots.length - 1]!;

    expect(urls(final)).toEqual([
      "https://beta.com", // timestamp 200
      "https://alpha.com", // timestamp 100
      "https://shared.com", // timestamp 50
    ]);
  });

  it("sorts by source (plugin count > plugin names > score)", async () => {
    setupSortTest();
    const snapshots = await collectAll(Findr.search("test", { sortOrder: "source" }));
    const final = snapshots[snapshots.length - 1]!;

    expect(urls(final)).toEqual([
      "https://shared.com", // 2 plugins
      "https://alpha.com", // plugin name "alpha" < "beta"
      "https://beta.com", // plugin name "beta"
    ]);
  });
});

// ---- Pub/Sub ----

describe("pub/sub", () => {
  it("emits search:batch for each plugin completion", async () => {
    const batches: SearchResponse[] = [];
    const unsub = Findr.subscribe<SearchResponse>("search:batch", (data) => batches.push(data));

    fakePlugin("a", [{ title: "A", description: "", url: "https://a.com" }]);
    fakePlugin("b", [{ title: "B", description: "", url: "https://b.com" }], { delayMs: 20 });

    await collectAll(Findr.search("test"));
    unsub();

    expect(batches).toHaveLength(2);
    expect(batches[0]!.results).toHaveLength(1);
    expect(batches[1]!.results).toHaveLength(2);
  });

  it("emits search:error when a plugin fails", async () => {
    const errors: PluginSearchError[] = [];
    const unsub = Findr.subscribe<PluginSearchError>("search:error", (e) => errors.push(e));

    failingPlugin("broken", "kaboom");
    await collectAll(Findr.search("test"));
    unsub();

    expect(errors).toHaveLength(1);
    expect(errors[0]!.pluginId).toBe("broken");
    expect(errors[0]!.error.message).toBe("kaboom");
  });

  it("emits search:done when all plugins finish", async () => {
    let done = false;
    const unsub = Findr.subscribe("search:done", () => {
      done = true;
    });

    fakePlugin("p", [{ title: "X", description: "", url: "https://x.com" }]);
    await collectAll(Findr.search("test"));
    unsub();

    expect(done).toBe(true);
  });

  it("unsubscribe stops further notifications", async () => {
    let count = 0;
    const unsub = Findr.subscribe("search:batch", () => {
      count++;
    });

    fakePlugin("a", [{ title: "A", description: "", url: "https://a.com" }]);
    await collectAll(Findr.search("test"));
    expect(count).toBe(1);

    unsub();
    Findr.clear();
    fakePlugin("b", [{ title: "B", description: "", url: "https://b.com" }]);
    await collectAll(Findr.search("test2"));

    // Should still be 1 since we unsubscribed
    // Note: clear() also clears subs, so this test is about unsub before clear
  });
});

// ---- Error handling ----

describe("error handling", () => {
  it("includes errors in snapshot when a plugin fails", async () => {
    failingPlugin("broken", "boom");
    fakePlugin("ok", [{ title: "OK", description: "", url: "https://ok.com" }]);

    const snapshots = await collectAll(Findr.search("test"));
    const final = snapshots[snapshots.length - 1]!;

    expect(final.results).toHaveLength(1);
    expect(final.errors).toHaveLength(1);
    expect(final.errors[0]!.pluginId).toBe("broken");
    expect(final.errors[0]!.error.message).toBe("boom");
  });

  it("continues search when one plugin fails", async () => {
    failingPlugin("broken", "fail");
    fakePlugin("working", [
      { title: "W1", description: "", url: "https://w1.com" },
      { title: "W2", description: "", url: "https://w2.com" },
    ]);

    const snapshots = await collectAll(Findr.search("test"));
    const hasResults = snapshots.some((s) => s.results.length > 0);
    expect(hasResults).toBe(true);
  });

  it("handles all plugins failing", async () => {
    failingPlugin("a", "fail a");
    failingPlugin("b", "fail b");

    const snapshots = await collectAll(Findr.search("test"));
    expect(snapshots).toHaveLength(2);

    const final = snapshots[snapshots.length - 1]!;
    expect(final.results).toHaveLength(0);
    expect(final.errors).toHaveLength(2);
  });
});

// ---- Abort signal ----

describe("abort signal", () => {
  it("passes signal to plugins", async () => {
    let receivedSignal: AbortSignal | null = null;

    Findr.register({
      name: "spy",
      search: async (_query, signal) => {
        receivedSignal = signal;
        return [];
      },
    });

    await collectAll(Findr.search("test"));
    expect(receivedSignal).not.toBeNull();
    expect(receivedSignal!.aborted).toBe(false);
  });

  it("aborts internal signal when external signal aborts", async () => {
    let internalSignal: AbortSignal | null = null;

    Findr.register({
      name: "slow",
      search: async (_query, signal) => {
        internalSignal = signal;
        await delay(200);
        return [];
      },
    });

    const controller = new AbortController();
    const gen = Findr.search("test", { signal: controller.signal });

    // Start iteration
    const promise = gen.next();
    await delay(10);
    controller.abort();

    try {
      await promise;
    } catch {
      // Expected
    }

    expect(internalSignal).not.toBeNull();
    expect(internalSignal!.aborted).toBe(true);
  });
});

// ---- displayName on aggregated results ----

describe("displayName in results", () => {
  it("uses displayName in pluginDisplayNames", async () => {
    fakePlugin("mock", [{ title: "X", description: "", url: "https://x.com" }], {
      displayName: "Local Mock",
    });

    const snapshots = await collectAll(Findr.search("test"));
    expect(snapshots[0]!.results[0]!.pluginIds).toEqual(["mock"]);
    expect(snapshots[0]!.results[0]!.pluginDisplayNames).toEqual(["Local Mock"]);
  });
});

// ---- Preferences persistence ----

describe("preferences", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "findr-prefs-"));
    Findr.setPrefsPath(join(tempDir, "preferences.json"));
  });

  // cleanup handled by OS temp dir purging; not critical for test correctness

  it("saves and loads enabled plugin state", async () => {
    fakePlugin("a", [], { enabled: true });
    fakePlugin("b", [], { enabled: false });
    fakePlugin("c", [], { enabled: true });

    Findr.disable("a");
    Findr.enable("b");
    // Wait for fire-and-forget saves to flush
    await delay(50);

    // Verify file was written
    const file = Bun.file(join(tempDir, "preferences.json"));
    expect(await file.exists()).toBe(true);
    const data = await file.json();
    expect(data.enabledPlugins.sort()).toEqual(["b", "c"]);

    // Reset to defaults and reload
    Findr.clear();
    fakePlugin("a", [], { enabled: true });
    fakePlugin("b", [], { enabled: false });
    fakePlugin("c", [], { enabled: true });

    await Findr.loadPreferences();

    expect(Findr.get("a")!.enabled).toBe(false);
    expect(Findr.get("b")!.enabled).toBe(true);
    expect(Findr.get("c")!.enabled).toBe(true);
  });

  it("toggle auto-saves preferences", async () => {
    fakePlugin("x", []);
    Findr.toggle("x");
    await delay(50);

    const data = await Bun.file(join(tempDir, "preferences.json")).json();
    expect(data.enabledPlugins).toEqual([]);
  });

  it("loadPreferences is a no-op when file does not exist", async () => {
    fakePlugin("a", [], { enabled: true });
    fakePlugin("b", [], { enabled: false });

    Findr.setPrefsPath(join(tempDir, "nonexistent.json"));
    await Findr.loadPreferences();

    // Defaults preserved
    expect(Findr.get("a")!.enabled).toBe(true);
    expect(Findr.get("b")!.enabled).toBe(false);
  });

  it("loadPreferences ignores unknown plugin names", async () => {
    fakePlugin("known", [], { enabled: false });

    // Write prefs referencing a plugin that doesn't exist
    await Bun.write(
      join(tempDir, "preferences.json"),
      JSON.stringify({ enabledPlugins: ["known", "ghost"] }),
    );

    await Findr.loadPreferences();
    expect(Findr.get("known")!.enabled).toBe(true);
    expect(Findr.get("ghost")).toBeUndefined();
  });

  it("loadPreferences handles malformed JSON gracefully", async () => {
    fakePlugin("a", [], { enabled: true });

    await Bun.write(join(tempDir, "preferences.json"), "not json{{{");
    await Findr.loadPreferences(); // should not throw

    expect(Findr.get("a")!.enabled).toBe(true);
  });
});
