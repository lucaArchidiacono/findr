import { describe, expect, it } from "vitest";
import type { SearchResult } from "../core/backend";
import { createInitialState, appReducer } from "./appState";

const createResult = (id: string, score: number, pluginId = "mock"): SearchResult => ({
  id,
  pluginIds: [pluginId],
  pluginDisplayNames: [pluginId],
  title: `Title ${id}`,
  description: `Description ${id}`,
  url: `https://example.com/${id}`,
  score,
  timestamp: Date.now() + score,
  receivedAt: Date.now(),
});

const setupState = () => {
  return {
    state: createInitialState(),
  };
};

describe("appState reducer", () => {
  it("initialises with default state", () => {
    const { state } = setupState();
    expect(state.enabledPluginIds).toEqual([]);
    expect(state.activePane).toBe("search");
  });

  it("sets loading state on search start and updates results on success", () => {
    const { state } = setupState();
    const loadingState = appReducer(state, { type: "search/start", query: "test" });
    expect(loadingState.isLoading).toBe(true);

    const results: SearchResult[] = [
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
    const firstPluginId = sorted.results[0].pluginIds[0] ?? "";
    const secondPluginId = sorted.results[1].pluginIds[0] ?? "";
    expect(firstPluginId <= secondPluginId).toBe(true);
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
