/**
 * Plugin SDK for Findr
 *
 * User plugins in ~/.config/findr just export:
 *   { name: string, search: (query, signal) => Promise<Result[]> }
 *
 * These types are provided for TypeScript users who want type safety.
 */

export type { PluginDef, PluginResult, PluginInfo } from "../core/findr";
