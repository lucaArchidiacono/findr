import { describe, expect, it } from "bun:test";
import { PluginManager, type SearchPlugin, type PluginSearchResult } from "./plugins";

const createPlugin = (id: string, options: { enabled?: boolean } = {}): SearchPlugin => ({
  id,
  displayName: id,
  description: `${id} plugin`,
  isEnabledByDefault: options.enabled ?? true,
  async search(): Promise<PluginSearchResult[]> {
    return [];
  },
});

describe("PluginManager", () => {
  it("registers plugins and respects default enabled state", () => {
    const manager = new PluginManager();
    const enabled = createPlugin("alpha", { enabled: true });
    const disabled = createPlugin("beta", { enabled: false });

    manager.register(enabled);
    manager.register(disabled);

    expect(manager.isEnabled("alpha")).toBe(true);
    expect(manager.isEnabled("beta")).toBe(false);
  });

  it("lists registered plugins sorted by id", () => {
    const manager = new PluginManager();
    manager.register(createPlugin("bravo"));
    manager.register(createPlugin("alpha"));
    manager.register(createPlugin("charlie"));

    const ids = manager.list().map((plugin) => plugin.id);
    expect(ids).toEqual(["alpha", "bravo", "charlie"]);
  });

  it("returns enabled plugin ids", () => {
    const manager = new PluginManager();
    manager.register(createPlugin("alpha"));
    manager.register(createPlugin("beta", { enabled: false }));
    manager.register(createPlugin("gamma"));

    expect(manager.getEnabledPluginIds()).toEqual(["alpha", "gamma"]);
  });

  it("sets enabled plugins from a list", () => {
    const manager = new PluginManager();
    manager.register(createPlugin("alpha"));
    manager.register(createPlugin("beta"));
    manager.register(createPlugin("gamma"));

    manager.setEnabledPlugins(["beta"]);

    expect(manager.getEnabledPluginIds()).toEqual(["beta"]);
    expect(manager.isEnabled("alpha")).toBe(false);
    expect(manager.isEnabled("beta")).toBe(true);
    expect(manager.isEnabled("gamma")).toBe(false);
  });

  it("toggles plugin enabled state", () => {
    const manager = new PluginManager();
    manager.register(createPlugin("alpha"));

    const enabledAfterToggle = manager.toggle("alpha");
    expect(enabledAfterToggle).toBe(false);
    expect(manager.isEnabled("alpha")).toBe(false);

    const enabledAfterSecondToggle = manager.toggle("alpha");
    expect(enabledAfterSecondToggle).toBe(true);
    expect(manager.isEnabled("alpha")).toBe(true);
  });
});
