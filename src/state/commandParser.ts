import type { SortOrder } from "../core/backend";

export type Command =
  | { kind: "enablePlugin"; pluginId: string }
  | { kind: "disablePlugin"; pluginId: string }
  | { kind: "togglePlugin"; pluginId: string }
  | { kind: "setSort"; sortOrder: SortOrder }
  | { kind: "togglePluginPanel" }
  | { kind: "clearResults" }
  | { kind: "showHelp" }
  | { kind: "toggleConsole" };

export type ParsedInput =
  | { type: "command"; command: Command }
  | { type: "search"; query: string }
  | { type: "empty" }
  | { type: "error"; message: string };

const sortAliases: Record<string, SortOrder> = {
  relevance: "relevance",
  rel: "relevance",
  recency: "recency",
  recent: "recency",
  newest: "recency",
  source: "source",
  provider: "source",
};

const normalizePluginId = (value: string): string => value.trim().toLowerCase();

export const parseInput = (rawInput: string): ParsedInput => {
  const normalized = rawInput.trim();
  if (!normalized) {
    return { type: "empty" };
  }

  if (!normalized.startsWith(":")) {
    return { type: "search", query: rawInput };
  }

  const body = normalized.slice(1).trim();
  if (!body) {
    return {
      type: "error",
      message: "Command is empty. Try :help for usage.",
    };
  }

  const [verbRaw, ...rest] = body.split(/\s+/);
  const verb = verbRaw?.toLowerCase();
  const remainder = rest.join(" ");

  switch (verb ?? "") {
    case "enable":
    case "en":
      if (!remainder) {
        return { type: "error", message: "Provide a plugin id to enable." };
      }
      return {
        type: "command",
        command: { kind: "enablePlugin", pluginId: normalizePluginId(remainder) },
      };
    case "disable":
    case "dis":
    case "off":
      if (!remainder) {
        return { type: "error", message: "Provide a plugin id to disable." };
      }
      return {
        type: "command",
        command: { kind: "disablePlugin", pluginId: normalizePluginId(remainder) },
      };
    case "toggle":
    case "tog":
      if (!remainder) {
        return { type: "error", message: "Provide a plugin id to toggle." };
      }
      return {
        type: "command",
        command: { kind: "togglePlugin", pluginId: normalizePluginId(remainder) },
      };
    case "sort": {
      if (!remainder) {
        return { type: "error", message: "Provide a sort order (relevance, recency, source)." };
      }
      const sortKey = remainder.toLowerCase();
      const sortOrder = sortAliases[sortKey];
      if (!sortOrder) {
        return {
          type: "error",
          message: `Unknown sort order "${remainder}". Use relevance | recency | source.`,
        };
      }
      return {
        type: "command",
        command: { kind: "setSort", sortOrder },
      };
    }
    case "plugins":
    case "providers":
    case "pl":
      return {
        type: "command",
        command: { kind: "togglePluginPanel" },
      };
    case "clear":
      return {
        type: "command",
        command: { kind: "clearResults" },
      };
    case "console":
      return {
        type: "command",
        command: { kind: "toggleConsole" },
      };
    case "help":
    case "?":
      return {
        type: "command",
        command: { kind: "showHelp" },
      };
    default:
      return {
        type: "error",
        message: `Unknown command "${verb}". Try :help for available commands.`,
      };
  }
};
