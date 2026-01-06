import { z } from "zod";

/**
 * Plugin SDK for Findr
 * This module provides the types and utilities for creating Findr search plugins
 * 
 * Similar to @opencode-ai/plugin, this provides a clean interface for external plugins
 */

/**
 * Context provided to plugins during initialization
 */
export interface PluginContext {
  /** Configuration directory path */
  configDir: string;
  /** Cache directory path */
  cacheDir: string;
  /** Environment variables (for API keys) */
  env: Record<string, string | undefined>;
}

/**
 * Search query passed to plugin's search function
 */
export interface SearchQuery {
  /** The search query string */
  query: string;
  /** Abort signal for cancellation */
  signal: AbortSignal;
  /** Maximum number of results to return */
  limit?: number;
}

/**
 * A single search result returned by a plugin
 */
export interface SearchResult {
  /** Optional unique identifier */
  id?: string;
  /** Result title */
  title: string;
  /** Result description/snippet */
  description: string;
  /** URL to the result */
  url: string;
  /** Relevance score (0-1 recommended, higher is better) */
  score?: number;
  /** Timestamp in milliseconds */
  timestamp?: number;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Plugin hooks interface
 * Plugins can implement various hooks to extend functionality
 */
export interface PluginHooks {
  /**
   * Perform a search and return results
   * This is the main hook that plugins must implement
   */
  search: (query: SearchQuery) => Promise<SearchResult[]>;

  /**
   * Optional: Called when plugin is enabled
   */
  onEnabled?: () => Promise<void>;

  /**
   * Optional: Called when plugin is disabled
   */
  onDisabled?: () => Promise<void>;

  /**
   * Optional: Called before search starts (can modify query)
   */
  "search.before"?: (
    input: { query: string },
    output: { query: string },
  ) => Promise<void>;

  /**
   * Optional: Called after search completes (can modify results)
   */
  "search.after"?: (
    input: { query: string; results: SearchResult[] },
    output: { results: SearchResult[] },
  ) => Promise<void>;
}

/**
 * Plugin metadata
 */
export interface PluginMeta {
  /** Unique identifier for the plugin */
  id: string;
  /** Display name shown in the UI */
  displayName: string;
  /** Optional description */
  description?: string;
  /** Whether enabled by default */
  isEnabledByDefault?: boolean;
  /** Plugin version */
  version?: string;
  /** Plugin author */
  author?: string;
}

/**
 * Plugin definition type
 * Plugins export a function that receives context and returns hooks
 */
export type Plugin = (context: PluginContext) => Promise<PluginMeta & PluginHooks>;

/**
 * Helper to create a plugin with proper typing
 */
export function definePlugin(
  plugin: Plugin,
): Plugin {
  return plugin;
}

/**
 * Schema helper for plugins (re-export zod)
 */
export const schema = z;

/**
 * Export types for external plugin authors
 */
export type {
  PluginContext as Context,
  SearchQuery as Query,
  SearchResult as Result,
  PluginHooks as Hooks,
  PluginMeta as Meta,
};
