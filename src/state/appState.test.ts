import { describe, expect, it } from "vitest";
import { PluginManager } from "../core/plugins";
import type { AggregatedSearchResult } from "../core/plugins";
import { createInitialState, appReducer } from "./appState";

const createResult = (id: string, score: number, pluginId = "mock"): AggregatedSearchResult => ({
  id,
  title: `Title ${id}`,
  description: `Description ${id}`,
  url: `https://example.com/${id}`,
  score,
  timestamp: Date.now() + score,
  receivedAt: Date.now(),
  pluginId,
  pluginDisplayName: pluginId,
  pluginIds: [pluginId],
  pluginDisplayNames: [pluginId],
});

const setupState = () => {
  const manager = new PluginManager();
  manager.register({
    id: "mock",
    displayName: "Mock",
    async search() {
      return [];
    },
  });
  return {
    manager,
    state: createInitialState(manager),
  };
};

describe("appState reducer", () => {
  it("initialises with enabled plugins from the manager", () => {
    const { state } = setupState();
    expect(state.enabledPluginIds).toEqual(["mock"]);
    expect(state.activePane).toBe("search");
  });

  it("sets loading state on search start and updates results on success", () => {
    const { state } = setupState();
    const loadingState = appReducer(state, { type: "search/start", query: "test" });
    expect(loadingState.isLoading).toBe(true);

    const results: AggregatedSearchResult[] = [
      createResult("a", 0.2),
      createResult("b", 0.9),
      createResult("c", 0.5),
    ];
    const successState = appReducer(loadingState, {
      type: "search/success",
      results,
      errors: [],
    });
    expect(successState.isLoading).toBe(false);
    expect(successState.results[0].id).toBe("b");
  });

  it("re-sorts results when sort order changes", () => {
    const { state } = setupState();
    const populated = {
      ...state,
      results: [createResult("a", 0.4, "mock"), createResult("b", 0.6, "brave")],
    };

    const sorted = appReducer(populated, { type: "sort/set", sortOrder: "source" });
    expect(sorted.results[0].pluginId <= sorted.results[1].pluginId).toBe(true);
  });

  it("clamps plugin panel selection", () => {
    const { state } = setupState();
    const updated = appReducer(state, {
      type: "plugins/setPanelIndex",
      index: 5,
      total: 1,
    });
    expect(updated.pluginPanelIndex).toBe(0);
  });
});
