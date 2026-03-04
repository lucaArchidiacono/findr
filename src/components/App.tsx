import { useEffect, useReducer, useRef } from "react";
import { useKeyboard, useRenderer } from "@opentui/react";
import type { ParsedInput } from "../state/commandParser";
import { parseInput } from "../state/commandParser";
import { appReducer, createInitialState, type AppAction, type AppState } from "../state/appState";
import { Findr, type SearchResponse, type SortOrder } from "../core/findr";
import SearchBar from "./SearchBar";
import ResultList from "./ResultList";
import PluginPanel from "./PluginPanel";
import StatusBar from "./StatusBar";
import FeedbackBar from "./FeedbackBar";
import SettingsPanel from "./SettingsPanel";
import { maskApiKey } from "../utils/formatting";

type Pane = AppState["activePane"];

const toFeedback = (message: string, tone: "info" | "error" = "info") =>
  ({
    message,
    tone,
  }) as const;

const paneOrder: Pane[] = ["search", "results", "plugins"];

const commandHelpText =
  "Commands -> /enable <id> · /disable <id> · /toggle <id> · /sort relevance|recency|source · /plugins · /settings · /clear";

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

  useEffect(() => {
    if (state.showConsole) {
      renderer?.console?.show?.();
    } else {
      renderer?.console?.hide?.();
    }
  }, [renderer, state.showConsole]);

  useEffect(() => {
    const registeredIds = Findr.enabledIds();
    if (registeredIds.join(",") !== state.enabledPluginIds.join(",")) {
      dispatch({ type: "plugins/setEnabled", pluginIds: registeredIds });
    }
  }, [state.enabledPluginIds]);

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

  const performSearch = async (rawQuery: string, sortOrder: SortOrder) => {
    const query = rawQuery.trim();
    if (!query) {
      dispatch({
        type: "feedback/set",
        feedback: toFeedback("Enter a search query or /command.", "error"),
      });
      return;
    }

    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    dispatch({ type: "search/start", query });

    let latestResponse: SearchResponse | null = null;

    try {
      for await (const snapshot of Findr.search(query, {
        signal: controller.signal,
        sortOrder,
      })) {
        latestResponse = snapshot;
        dispatch({
          type: "search/progress",
          results: snapshot.results,
          errors: snapshot.errors,
        });
      }

      const finalResponse = latestResponse ?? { results: [], errors: [] };
      handleSearchResponse(finalResponse);
      if (finalResponse.results.length === 0) {
        dispatch({
          type: "feedback/set",
          feedback: toFeedback("No results found. Try another query.", "info"),
        });
      }
    } catch (error) {
      if (controller.signal.aborted) {
        return;
      }
      const message = error instanceof Error ? error.message : "Search failed unexpectedly.";
      handleSearchError(message, latestResponse?.errors ?? []);
    }
  };

  const updateInputValue = (value: string) => {
    dispatch({ type: "input/change", value });
  };

  const normalizeId = (value: string) => value.toLowerCase();

  const resolvePlugin = (idOrName: string) => {
    const normalized = normalizeId(idOrName);
    return Findr.list().find(
      (p) => p.name.toLowerCase() === normalized || p.displayName.toLowerCase() === normalized,
    );
  };

  const syncEnabledPlugins = () => {
    dispatch({
      type: "plugins/setEnabled",
      pluginIds: Findr.enabledIds(),
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
      await performSearch(parsed.query, state.sortOrder);
      return "keep";
    }

    const { command } = parsed;
    switch (command.kind) {
      case "enablePlugin": {
        const plugin = resolvePlugin(command.pluginId);
        if (!plugin) {
          dispatch({
            type: "feedback/set",
            feedback: toFeedback(`Plugin "${command.pluginId}" not found.`, "error"),
          });
          return "keep";
        }
        Findr.enable(plugin.name);
        syncEnabledPlugins();
        dispatch({
          type: "feedback/set",
          feedback: toFeedback(`Enabled ${plugin.displayName}.`, "info"),
        });
        return "clear";
      }
      case "disablePlugin": {
        const plugin = resolvePlugin(command.pluginId);
        if (!plugin) {
          dispatch({
            type: "feedback/set",
            feedback: toFeedback(`Plugin "${command.pluginId}" not found.`, "error"),
          });
          return "keep";
        }
        Findr.disable(plugin.name);
        syncEnabledPlugins();
        dispatch({
          type: "feedback/set",
          feedback: toFeedback(`Disabled ${plugin.displayName}.`, "info"),
        });
        return "clear";
      }
      case "togglePlugin": {
        const plugin = resolvePlugin(command.pluginId);
        if (!plugin) {
          dispatch({
            type: "feedback/set",
            feedback: toFeedback(`Plugin "${command.pluginId}" not found.`, "error"),
          });
          return "keep";
        }
        const enabled = Findr.toggle(plugin.name);
        syncEnabledPlugins();
        dispatch({
          type: "feedback/set",
          feedback: toFeedback(
            `${enabled ? "Enabled" : "Disabled"} ${plugin.displayName}.`,
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
        if (state.query) {
          await performSearch(state.query, command.sortOrder);
        }
        dispatch({
          type: "feedback/set",
          feedback: toFeedback(`Sort order set to ${command.sortOrder}.`, "info"),
        });
        return "clear";
      case "togglePluginPanel": {
        const willShow = !state.showPluginPanel;
        const allPlugins = Findr.list();
        dispatch({ type: "plugins/setPanelVisible", visible: willShow });
        if (willShow) {
          dispatch({ type: "plugins/setPanelIndex", index: 0, total: allPlugins.length });
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
      case "toggleSettings":
        if (state.showSettings) {
          dispatch({ type: "settings/hide" });
        } else {
          dispatch({ type: "settings/show" });
        }
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
    const allPlugins = Findr.list();
    dispatch({
      type: "plugins/setPanelIndex",
      index: state.pluginPanelIndex + delta,
      total: allPlugins.length,
    });
  };

  const togglePluginAtCursor = () => {
    const allPlugins = Findr.list();
    const target = allPlugins[state.pluginPanelIndex];
    if (!target) {
      return;
    }
    const enabled = Findr.toggle(target.name);
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

  const getSettingsEntries = () => {
    return Findr.list()
      .filter((p) => p.apiKeyEnv)
      .map((p) => ({
        pluginName: p.name,
        pluginDisplayName: p.displayName,
        envVarName: p.apiKeyEnv!,
        isConfigured: Boolean(Findr.getApiKey(p.apiKeyEnv!)),
        maskedValue: maskApiKey(Findr.getApiKey(p.apiKeyEnv!)),
      }));
  };

  const handleSettingsEditSubmit = () => {
    const entries = getSettingsEntries();
    const entry = entries[state.settingsIndex];
    if (entry && state.settingsEditValue.trim()) {
      Findr.setApiKey(entry.envVarName, state.settingsEditValue.trim());
    }
    dispatch({ type: "settings/commitEdit" });
    dispatch({
      type: "feedback/set",
      feedback: toFeedback(
        entry ? `Saved API key for ${entry.pluginDisplayName}.` : "Saved.",
        "info",
      ),
    });
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

    if (state.showSettings) {
      if (state.settingsEditing) {
        if (key.name === "escape") {
          dispatch({ type: "settings/cancelEdit" });
        }
        return;
      }
      const settingsEntries = getSettingsEntries();
      if (key.name === "escape") {
        dispatch({ type: "settings/hide" });
      } else if (key.name === "down" || key.name === "j") {
        dispatch({
          type: "settings/setIndex",
          index: state.settingsIndex + 1,
          total: settingsEntries.length,
        });
      } else if (key.name === "up" || key.name === "k") {
        dispatch({
          type: "settings/setIndex",
          index: state.settingsIndex - 1,
          total: settingsEntries.length,
        });
      } else if (key.name === "enter" || key.name === "return") {
        const entry = settingsEntries[state.settingsIndex];
        if (entry) {
          const currentValue = Findr.getApiKey(entry.envVarName) ?? "";
          dispatch({ type: "settings/startEdit", currentValue });
        }
      }
      return;
    }

    if (key.name === "tab") {
      cyclePane();
      return;
    }

    const handleResultsNavigation = () => {
      if (state.filterActive) {
        if (key.name === "escape") {
          dispatch({ type: "filter/deactivate" });
        } else if (key.name === "down") {
          changeSelection(1);
        } else if (key.name === "up") {
          changeSelection(-1);
        } else if (key.name === "enter" || key.name === "return") {
          dispatch({ type: "filter/deactivate" });
        }
        return;
      }

      if (key.sequence === "/") {
        dispatch({ type: "filter/activate" });
      } else if (key.name === "down" || key.name === "j") {
        changeSelection(1);
      } else if (key.name === "up" || key.name === "k") {
        changeSelection(-1);
      } else if (key.name === "escape") {
        dispatch({ type: "filter/deactivate" });
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

  const allPlugins = Findr.list();
  const pluginsForPanel = allPlugins.map((p) => ({
    id: p.name,
    displayName: p.displayName,
    description: p.description,
  }));

  return (
    <box flexDirection="column" flexGrow={1} padding={1}>
      <StatusBar
        sortOrder={state.sortOrder}
        enabledPlugins={state.enabledPluginIds.length}
        totalPlugins={allPlugins.length}
        activePane={state.showSettings ? "search" : state.activePane}
      />

      {state.showSettings ? (
        <box flexGrow={1} marginTop={1}>
          <SettingsPanel
            entries={getSettingsEntries()}
            selectedIndex={state.settingsIndex}
            editing={state.settingsEditing}
            editValue={state.settingsEditValue}
            onEditChange={(value) => dispatch({ type: "settings/changeEdit", value })}
            onEditSubmit={handleSettingsEditSubmit}
          />
        </box>
      ) : (
        <>
          <box flexGrow={1} flexDirection="row" marginTop={1}>
            <ResultList
              results={state.results}
              selectedIndex={state.selectedIndex}
              isLoading={state.isLoading}
              focused={state.activePane === "results"}
              filterActive={state.filterActive}
              filterText={state.filterText}
              onFilterChange={(text) => dispatch({ type: "filter/change", text })}
            />
            <PluginPanel
              plugins={pluginsForPanel}
              enabledPluginIds={state.enabledPluginIds}
              selectedIndex={state.pluginPanelIndex}
              visible={state.showPluginPanel}
              focused={state.activePane === "plugins"}
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
        </>
      )}
    </box>
  );
};

export default App;
