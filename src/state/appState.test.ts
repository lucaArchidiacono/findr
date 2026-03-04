import { describe, expect, it } from "bun:test";
import type { SearchResult } from "../core/findr";
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

describe("settings state", () => {
  it("shows settings panel", () => {
    const { state } = setupState();
    const next = appReducer(state, { type: "settings/show" });
    expect(next.showSettings).toBe(true);
    expect(next.settingsIndex).toBe(0);
    expect(next.settingsEditing).toBe(false);
  });

  it("hides settings panel", () => {
    const { state } = setupState();
    const shown = appReducer(state, { type: "settings/show" });
    const hidden = appReducer(shown, { type: "settings/hide" });
    expect(hidden.showSettings).toBe(false);
  });

  it("navigates settings index with wrapping", () => {
    const { state } = setupState();
    const shown = appReducer(state, { type: "settings/show" });
    const moved = appReducer(shown, { type: "settings/setIndex", index: 1, total: 3 });
    expect(moved.settingsIndex).toBe(1);

    const wrapped = appReducer(shown, { type: "settings/setIndex", index: 2, total: 2 });
    expect(wrapped.settingsIndex).toBe(0);
  });

  it("starts and cancels editing", () => {
    const { state } = setupState();
    const editing = appReducer(state, {
      type: "settings/startEdit",
      currentValue: "sk-old",
    });
    expect(editing.settingsEditing).toBe(true);
    expect(editing.settingsEditValue).toBe("sk-old");

    const cancelled = appReducer(editing, { type: "settings/cancelEdit" });
    expect(cancelled.settingsEditing).toBe(false);
    expect(cancelled.settingsEditValue).toBe("");
  });

  it("commits editing and clears edit state", () => {
    const { state } = setupState();
    const editing = appReducer(state, {
      type: "settings/startEdit",
      currentValue: "",
    });
    const typed = appReducer(editing, {
      type: "settings/changeEdit",
      value: "sk-new",
    });
    expect(typed.settingsEditValue).toBe("sk-new");

    const committed = appReducer(typed, { type: "settings/commitEdit" });
    expect(committed.settingsEditing).toBe(false);
    expect(committed.settingsEditValue).toBe("");
  });
});
