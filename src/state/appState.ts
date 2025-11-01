import type { SearchResult } from "../core/backend";
import type { PluginSearchError } from "../core/plugins";
import { sortResults, type SortOrder } from "../core/sorting";

export interface CommandFeedback {
  message: string;
  tone: "info" | "warning" | "error";
}

export interface AppState {
  inputValue: string;
  query: string;
  results: SearchResult[];
  sortOrder: SortOrder;
  selectedIndex: number;
  isLoading: boolean;
  pluginErrors: PluginSearchError[];
  enabledPluginIds: string[];
  showPluginPanel: boolean;
  showConsole: boolean;
  pluginPanelIndex: number;
  feedback?: CommandFeedback;
  errorMessage?: string;
  activePane: "search" | "results" | "plugins";
}

export type AppAction =
  | { type: "input/change"; value: string }
  | { type: "search/start"; query: string }
  | { type: "search/success"; results: SearchResult[]; errors: PluginSearchError[] }
  | { type: "search/error"; message: string; errors: PluginSearchError[] }
  | { type: "results/selectNext" }
  | { type: "results/selectPrevious" }
  | { type: "results/select"; index: number }
  | { type: "results/clear" }
  | { type: "sort/set"; sortOrder: SortOrder }
  | { type: "plugins/setEnabled"; pluginIds: string[] }
  | { type: "plugins/setPanelVisible"; visible: boolean }
  | { type: "plugins/setPanelIndex"; index: number; total: number }
  | { type: "feedback/set"; feedback?: CommandFeedback }
  | { type: "pane/set"; pane: AppState["activePane"] }
  | { type: "console/toggle"; visible: boolean };

export const createInitialState = (): AppState => ({
  inputValue: "",
  query: "",
  results: [],
  sortOrder: "relevance",
  selectedIndex: 0,
  isLoading: false,
  pluginErrors: [],
  enabledPluginIds: [],
  showPluginPanel: false,
  showConsole: false,
  pluginPanelIndex: 0,
  activePane: "search",
});

const clampIndex = (index: number, max: number) => {
  if (max <= 0) {
    return 0;
  }
  if (index < 0) {
    return max - 1;
  }
  if (index >= max) {
    return 0;
  }
  return index;
};

export const appReducer = (state: AppState, action: AppAction): AppState => {
  switch (action.type) {
    case "input/change":
      return {
        ...state,
        inputValue: action.value,
        feedback: undefined,
        errorMessage: undefined,
      };
    case "search/start":
      return {
        ...state,
        query: action.query,
        isLoading: true,
        errorMessage: undefined,
        feedback: undefined,
        pluginErrors: [],
      };
    case "search/success": {
      const hasResults = action.results.length > 0;
      return {
        ...state,
        isLoading: false,
        results: sortResults(action.results, state.sortOrder),
        pluginErrors: action.errors,
        selectedIndex: hasResults ? 0 : 0,
        errorMessage: undefined,
      };
    }
    case "search/error":
      return {
        ...state,
        isLoading: false,
        results: [],
        pluginErrors: action.errors,
        errorMessage: action.message,
        selectedIndex: 0,
      };
    case "results/clear":
      return {
        ...state,
        results: [],
        selectedIndex: 0,
        pluginErrors: [],
        errorMessage: undefined,
      };
    case "results/selectNext":
      return {
        ...state,
        selectedIndex: clampIndex(state.selectedIndex + 1, state.results.length),
      };
    case "results/selectPrevious":
      return {
        ...state,
        selectedIndex: clampIndex(state.selectedIndex - 1, state.results.length),
      };
    case "results/select":
      return {
        ...state,
        selectedIndex: clampIndex(action.index, state.results.length),
      };
    case "sort/set":
      return {
        ...state,
        sortOrder: action.sortOrder,
        results: sortResults(state.results, action.sortOrder),
      };
    case "plugins/setEnabled":
      return {
        ...state,
        enabledPluginIds: action.pluginIds,
      };
    case "plugins/setPanelVisible":
      return {
        ...state,
        showPluginPanel: action.visible,
      };
    case "plugins/setPanelIndex":
      return {
        ...state,
        pluginPanelIndex: clampIndex(action.index, action.total),
      };
    case "feedback/set":
      return {
        ...state,
        feedback: action.feedback,
      };
    case "pane/set":
      return {
        ...state,
        activePane: action.pane,
      };
    case "console/toggle":
      return {
        ...state,
        showConsole: action.visible,
      };
    default:
      return state;
  }
};
