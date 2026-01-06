import { z } from "zod";
import { BusEvent } from "./bus-event";

/**
 * Search-related events for the Findr application
 */

// Result schema for events
const SearchResultSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  url: z.string(),
  score: z.number().optional(),
  timestamp: z.number().optional(),
  pluginIds: z.array(z.string()),
  pluginDisplayNames: z.array(z.string()),
  receivedAt: z.number(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const PluginErrorSchema = z.object({
  pluginId: z.string(),
  pluginDisplayName: z.string(),
  error: z.string(),
});

/**
 * Search started event
 */
export const SearchStarted = BusEvent.define(
  "search.started",
  z.object({
    query: z.string(),
    enabledPlugins: z.array(z.string()),
  }),
);

/**
 * Results received from a plugin (batch)
 * This is the key event - results come in batches per plugin
 * and are appended to the existing results without flicker
 */
export const SearchResultsBatch = BusEvent.define(
  "search.results.batch",
  z.object({
    pluginId: z.string(),
    pluginDisplayName: z.string(),
    results: z.array(SearchResultSchema),
    isComplete: z.boolean(),
  }),
);

/**
 * Aggregated results updated
 * Emitted after each plugin batch is processed and merged
 */
export const SearchResultsUpdated = BusEvent.define(
  "search.results.updated",
  z.object({
    results: z.array(SearchResultSchema),
    totalPluginsCompleted: z.number(),
    totalPlugins: z.number(),
  }),
);

/**
 * Plugin error occurred
 */
export const SearchPluginError = BusEvent.define(
  "search.plugin.error",
  PluginErrorSchema,
);

/**
 * Search completed (all plugins finished)
 */
export const SearchCompleted = BusEvent.define(
  "search.completed",
  z.object({
    query: z.string(),
    totalResults: z.number(),
    errors: z.array(PluginErrorSchema),
    durationMs: z.number(),
  }),
);

/**
 * Search cancelled
 */
export const SearchCancelled = BusEvent.define(
  "search.cancelled",
  z.object({
    query: z.string(),
    reason: z.string().optional(),
  }),
);

/**
 * Plugin loaded event
 */
export const PluginLoaded = BusEvent.define(
  "plugin.loaded",
  z.object({
    id: z.string(),
    displayName: z.string(),
    source: z.enum(["builtin", "external"]),
    path: z.string().optional(),
  }),
);

/**
 * Plugin toggled event
 */
export const PluginToggled = BusEvent.define(
  "plugin.toggled",
  z.object({
    id: z.string(),
    displayName: z.string(),
    enabled: z.boolean(),
  }),
);
