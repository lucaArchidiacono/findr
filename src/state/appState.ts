import type { SearchResult, SortOrder, PluginSearchError } from "../core/findr";

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
  filterActive: boolean;
  filterText: string;
  feedback?: CommandFeedback;
  errorMessage?: string;
  activePane: "search" | "results" | "plugins";
  showSettings: boolean;
  settingsIndex: number;
  settingsEditing: boolean;
  settingsEditValue: string;
}

export type AppAction =
  | { type: "input/change"; value: string }
  | { type: "search/start"; query: string }
  | { type: "search/progress"; results: SearchResult[]; errors: PluginSearchError[] }
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
  | { type: "console/toggle"; visible: boolean }
  | { type: "filter/activate" }
  | { type: "filter/change"; text: string }
  | { type: "filter/deactivate" }
  | { type: "settings/show" }
  | { type: "settings/hide" }
  | { type: "settings/setIndex"; index: number; total: number }
  | { type: "settings/startEdit"; currentValue: string }
  | { type: "settings/changeEdit"; value: string }
  | { type: "settings/cancelEdit" }
  | { type: "settings/commitEdit" };

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
  filterActive: false,
  filterText: "",
  activePane: "search",
  showSettings: false,
  settingsIndex: 0,
  settingsEditing: false,
  settingsEditValue: "",
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
        filterActive: false,
        filterText: "",
      };
    case "search/progress": {
      const results = action.results;
      const hasResults = results.length > 0;
      const nextSelectedIndex = clampIndex(state.selectedIndex, results.length);
      return {
        ...state,
        results,
        pluginErrors: action.errors,
        selectedIndex: hasResults ? nextSelectedIndex : 0,
      };
    }
    case "search/success": {
      const results = action.results;
      const hasResults = results.length > 0;
      return {
        ...state,
        isLoading: false,
        results,
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
        filterActive: false,
        filterText: "",
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
    case "filter/activate":
      return {
        ...state,
        filterActive: true,
        filterText: "",
      };
    case "filter/change":
      return {
        ...state,
        filterText: action.text,
        selectedIndex: 0,
      };
    case "filter/deactivate":
      return {
        ...state,
        filterActive: false,
        filterText: "",
      };
    case "settings/show":
      return {
        ...state,
        showSettings: true,
        settingsIndex: 0,
        settingsEditing: false,
        settingsEditValue: "",
      };
    case "settings/hide":
      return {
        ...state,
        showSettings: false,
        settingsEditing: false,
        settingsEditValue: "",
      };
    case "settings/setIndex":
      return {
        ...state,
        settingsIndex: clampIndex(action.index, action.total),
      };
    case "settings/startEdit":
      return {
        ...state,
        settingsEditing: true,
        settingsEditValue: action.currentValue,
      };
    case "settings/changeEdit":
      return {
        ...state,
        settingsEditValue: action.value,
      };
    case "settings/cancelEdit":
      return {
        ...state,
        settingsEditing: false,
        settingsEditValue: "",
      };
    case "settings/commitEdit":
      return {
        ...state,
        settingsEditing: false,
        settingsEditValue: "",
      };
    default:
      return state;
  }
};
