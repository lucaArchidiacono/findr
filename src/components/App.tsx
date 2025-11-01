import { useEffect, useReducer, useRef } from "react";
import { useKeyboard, useRenderer } from "@opentui/react";
import { TextAttributes } from "@opentui/core";
import type { ParsedInput } from "../state/commandParser";
import { parseInput } from "../state/commandParser";
import { appReducer, createInitialState, type AppAction, type AppState } from "../state/appState";
import type { SearchResponse } from "../core/backend";
import SearchBar from "./SearchBar";
import ResultList from "./ResultList";
import PluginPanel from "./PluginPanel";
import StatusBar from "./StatusBar";
import FeedbackBar from "./FeedbackBar";
import { useBackend } from "../core/backend";
import plugins from "../plugins";

type Pane = AppState["activePane"];

const toFeedback = (message: string, tone: "info" | "error" = "info") =>
  ({
    message,
    tone,
  }) as const;

const paneOrder: Pane[] = ["search", "results", "plugins"];

const commandHelpText =
  "Commands -> :enable <id> · :disable <id> · :toggle <id> · :sort relevance|recency|source · :plugins · :clear";

const pickOpenCommand = () => {
  switch (process.platform) {
    case "darwin":
      return ["open"];
    case "win32":
      return ["cmd", "/c", "start", ""];
    default:
      return ["xdg-open"];
  }
};

const openUrlInBrowser = async (url: string) => {
  try {
    const cmd = pickOpenCommand();
    await Bun.spawn({
      cmd: [...cmd, url],
      stdout: "ignore",
      stderr: "ignore",
    }).exited;
  } catch (error) {
    throw new Error(
      `Failed to open browser: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
};

export const App = () => {
  const [state, dispatch] = useReducer(appReducer, undefined, () => createInitialState());
  const abortControllerRef = useRef<AbortController | null>(null);
  const renderer = useRenderer();
  const backend = useBackend();

  useEffect(() => {
    if (state.showConsole) {
      renderer?.console?.show?.();
    } else {
      renderer?.console?.hide?.();
    }
  }, [renderer, state.showConsole]);

  useEffect(() => {
    const registeredIds = backend.getEnabledPluginIds();
    if (registeredIds.join(",") !== state.enabledPluginIds.join(",")) {
      dispatch({ type: "plugins/setEnabled", pluginIds: registeredIds });
    }
  }, [state.enabledPluginIds, backend]);

  const setPane = (pane: Pane) => {
    dispatch({ type: "pane/set", pane });
  };

  const cyclePane = () => {
    const visiblePaneOrder = paneOrder.filter((pane) => {
      if (pane === "results") {
        return state.results.length > 0;
      }
      if (pane === "plugins") {
        return state.showPluginPanel;
      }
      return true;
    });

    const currentIndex = visiblePaneOrder.indexOf(state.activePane);
    const nextPane = visiblePaneOrder[(currentIndex + 1) % visiblePaneOrder.length]!;
    setPane(nextPane);
  };

  const handleSearchResponse = (response: SearchResponse) => {
    dispatch({
      type: "search/success",
      results: response.results,
      errors: response.errors,
    });
  };

  const handleSearchError = (message: string, errors: SearchResponse["errors"]) => {
    dispatch({
      type: "search/error",
      message,
      errors,
    });
  };

  const performSearch = async (rawQuery: string) => {
    const query = rawQuery.trim();
    if (!query) {
      dispatch({
        type: "feedback/set",
        feedback: toFeedback("Enter a search query or :command.", "error"),
      });
      return;
    }

    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    dispatch({ type: "search/start", query });

    try {
      const response = await backend.search(query, { signal: controller.signal });
      handleSearchResponse(response);
      if (response.results.length === 0) {
        dispatch({
          type: "feedback/set",
          feedback: toFeedback("No results found. Try another query.", "info"),
        });
      }
    } catch (error) {
      if (controller.signal.aborted) {
        return;
      }
      handleSearchError(error instanceof Error ? error.message : "Search failed unexpectedly.", []);
    }
  };

  const updateInputValue = (value: string) => {
    dispatch({ type: "input/change", value });
  };

  const normalizeId = (value: string) => value.toLowerCase();

  const resolvePlugin = (idOrName: string) => {
    const normalized = normalizeId(idOrName);
    return plugins.find(
      (registration) =>
        registration.id.toLowerCase() === normalized ||
        registration.displayName.toLowerCase() === normalized,
    );
  };

  const syncEnabledPlugins = () => {
    dispatch({
      type: "plugins/setEnabled",
      pluginIds: backend.getEnabledPluginIds(),
    });
  };

  const executeCommand = async (parsed: ParsedInput): Promise<"keep" | "clear"> => {
    if (parsed.type === "error") {
      dispatch({ type: "feedback/set", feedback: toFeedback(parsed.message, "error") });
      return "keep";
    }

    if (parsed.type === "empty") {
      return "keep";
    }

    if (parsed.type === "search") {
      await performSearch(parsed.query);
      return "keep";
    }

    const { command } = parsed;
    switch (command.kind) {
      case "enablePlugin": {
        const registration = resolvePlugin(command.pluginId);
        if (!registration) {
          dispatch({
            type: "feedback/set",
            feedback: toFeedback(`Plugin "${command.pluginId}" not found.`, "error"),
          });
          return "keep";
        }
        backend.setPluginEnabled(registration.id, true);
        syncEnabledPlugins();
        dispatch({
          type: "feedback/set",
          feedback: toFeedback(`Enabled ${registration.displayName}.`, "info"),
        });
        return "clear";
      }
      case "disablePlugin": {
        const registration = resolvePlugin(command.pluginId);
        if (!registration) {
          dispatch({
            type: "feedback/set",
            feedback: toFeedback(`Plugin "${command.pluginId}" not found.`, "error"),
          });
          return "keep";
        }
        backend.setPluginEnabled(registration.id, false);
        syncEnabledPlugins();
        dispatch({
          type: "feedback/set",
          feedback: toFeedback(`Disabled ${registration.displayName}.`, "info"),
        });
        return "clear";
      }
      case "togglePlugin": {
        const registration = resolvePlugin(command.pluginId);
        if (!registration) {
          dispatch({
            type: "feedback/set",
            feedback: toFeedback(`Plugin "${command.pluginId}" not found.`, "error"),
          });
          return "keep";
        }
        const enabled = backend.togglePlugin(registration.id);
        syncEnabledPlugins();
        dispatch({
          type: "feedback/set",
          feedback: toFeedback(
            `${enabled ? "Enabled" : "Disabled"} ${registration.displayName}.`,
            "info",
          ),
        });
        return "clear";
      }
      case "setSort":
        dispatch({
          type: "sort/set",
          sortOrder: command.sortOrder,
        });
        dispatch({
          type: "feedback/set",
          feedback: toFeedback(`Sort order set to ${command.sortOrder}.`, "info"),
        });
        return "clear";
      case "togglePluginPanel": {
        const willShow = !state.showPluginPanel;
        dispatch({ type: "plugins/setPanelVisible", visible: willShow });
        if (willShow) {
          dispatch({ type: "plugins/setPanelIndex", index: 0, total: plugins.length });
          setPane("plugins");
        } else if (state.activePane === "plugins") {
          setPane(state.results.length > 0 ? "results" : "search");
        }
        return "clear";
      }
      case "clearResults":
        dispatch({ type: "results/clear" });
        dispatch({
          type: "feedback/set",
          feedback: toFeedback("Cleared results.", "info"),
        });
        return "clear";
      case "showHelp":
        dispatch({
          type: "feedback/set",
          feedback: toFeedback(commandHelpText, "info"),
        });
        return "keep";
      case "toggleConsole":
        dispatch({ type: "console/toggle", visible: !state.showConsole });
        return "clear";
      default:
        return "keep";
    }
  };

  const handleSubmit = async () => {
    const parsed = parseInput(state.inputValue);
    const result = await executeCommand(parsed);
    if (result === "clear") {
      updateInputValue("");
    }
  };

  const changeSelection = (delta: number) => {
    const nextAction: AppAction =
      delta > 0 ? { type: "results/selectNext" } : { type: "results/selectPrevious" };
    dispatch(nextAction);
  };

  const changePluginCursor = (delta: number) => {
    dispatch({
      type: "plugins/setPanelIndex",
      index: state.pluginPanelIndex + delta,
      total: plugins.length,
    });
  };

  const togglePluginAtCursor = () => {
    const target = plugins[state.pluginPanelIndex];
    if (!target) {
      return;
    }
    const enabled = backend.togglePlugin(target.id);
    syncEnabledPlugins();
    dispatch({
      type: "feedback/set",
      feedback: toFeedback(`${enabled ? "Enabled" : "Disabled"} ${target.displayName}.`, "info"),
    });
  };

  const selectPaneForArrow = (pane: Pane, handler: () => void) => {
    if (state.activePane === pane) {
      handler();
    }
  };

  useKeyboard((key) => {
    if (!key) {
      return;
    }

    if (state.activePane === "search") {
      const isCommandDelete =
        (key.meta &&
          !key.option &&
          !key.ctrl &&
          (key.name === "backspace" || key.name === "delete")) ||
        key.sequence === "\x15" ||
        (key.ctrl && key.name === "u");

      if (isCommandDelete) {
        updateInputValue("");
        return;
      }
    }

    if (key.ctrl && (key.name === "c" || key.name === "d")) {
      abortControllerRef.current?.abort();
      renderer?.destroy();
      process.exit(0);
    }

    if (key.name === "tab") {
      cyclePane();
      return;
    }

    const handleResultsNavigation = () => {
      if (key.name === "down" || key.name === "j") {
        changeSelection(1);
      } else if (key.name === "up" || key.name === "k") {
        changeSelection(-1);
      } else if (key.name === "enter" || key.name === "return") {
        const selected = state.results[state.selectedIndex];
        if (selected) {
          openUrlInBrowser(selected.url).catch((error) => {
            dispatch({
              type: "feedback/set",
              feedback: toFeedback(
                error instanceof Error ? error.message : "Unable to open URL.",
                "error",
              ),
            });
          });
        }
      }
    };

    const handlePluginNavigation = () => {
      if (key.name === "down" || key.name === "j") {
        changePluginCursor(1);
      } else if (key.name === "up" || key.name === "k") {
        changePluginCursor(-1);
      } else if (key.name === "space" || key.name === "enter") {
        togglePluginAtCursor();
      }
    };

    selectPaneForArrow("results", handleResultsNavigation);
    selectPaneForArrow("plugins", handlePluginNavigation);
  });

  const pluginErrorMessages = state.pluginErrors.map(
    (error) => `[${error.pluginDisplayName}] ${error.error.message}`,
  );

  return (
    <box flexDirection="column" flexGrow={1} padding={1}>
      <StatusBar
        sortOrder={state.sortOrder}
        enabledPlugins={state.enabledPluginIds.length}
        totalPlugins={plugins.length}
        activePane={state.activePane}
      />

      <box flexGrow={1} flexDirection="row" marginTop={1}>
        <ResultList
          results={state.results}
          selectedIndex={state.selectedIndex}
          isLoading={state.isLoading}
        />
        <PluginPanel
          plugins={plugins}
          enabledPluginIds={state.enabledPluginIds}
          selectedIndex={state.pluginPanelIndex}
          visible={state.showPluginPanel}
        />
      </box>

      <box marginTop={1}>
        <FeedbackBar
          feedback={state.feedback}
          errorMessage={state.errorMessage}
          pluginErrors={pluginErrorMessages}
        />
      </box>

      <box marginTop={1}>
        <SearchBar
          value={state.inputValue}
          onChange={updateInputValue}
          onSubmit={handleSubmit}
          isLoading={state.isLoading}
          focused={state.activePane === "search"}
        />
      </box>

      <box marginTop={1}>
        <text attributes={TextAttributes.DIM}>
          Enabled plugins respond to searches in parallel. Toggle providers with :plugins or the
          sidebar.
        </text>
      </box>
    </box>
  );
};

export default App;
