/**
 * Plugins module
 * 
 * This module provides backwards compatibility with the old plugin system
 * while also exposing the new plugin loader.
 * 
 * The new plugin system:
 * - Loads external plugins from ~/.config/findr/plugins/*.{ts,js}
 * - Uses an OpenCode-style plugin interface with hooks
 * - Streams results via event bus
 * 
 * Migration path:
 * - Old: import plugins from "../plugins"
 * - New: import { PluginLoader } from "../core/plugin-loader"
 */

import { registerBuiltinPlugins, getBuiltinPlugins } from "./builtin";
import { PluginLoader } from "../core/plugin-loader";

// Register builtin plugins on module load
registerBuiltinPlugins();

// Export builtin plugins array for backwards compatibility
const plugins = getBuiltinPlugins();
export default plugins;

// Re-export the plugin loader for new code
export { PluginLoader } from "../core/plugin-loader";
export { registerBuiltinPlugins, getBuiltinPlugins } from "./builtin";
