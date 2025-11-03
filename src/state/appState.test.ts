import { describe, expect, it } from "bun:test";
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
    expect(successState.results).toBe(results);
  });

  it("updates results incrementally during search progress", () => {
    const { state } = setupState();
    const loadingState = appReducer(state, { type: "search/start", query: "test" });

    const results: SearchResult[] = [
      createResult("a", 0.1),
      createResult("c", 0.7),
      createResult("b", 0.5),
    ];

    const progressState = appReducer(loadingState, {
      type: "search/progress",
      results,
      errors: [],
    });

    expect(progressState.isLoading).toBe(true);
    expect(progressState.results).toBe(results);
    expect(progressState.pluginErrors).toEqual([]);
  });

  it("stores requested sort order without mutating results", () => {
    const { state } = setupState();
    const populated = {
      ...state,
      results: [createResult("a", 0.4, "mock"), createResult("b", 0.6, "brave")],
    };

    const sorted = appReducer(populated, { type: "sort/set", sortOrder: "source" });
    expect(sorted.sortOrder).toBe("source");
    expect(sorted.results).toBe(populated.results);
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
