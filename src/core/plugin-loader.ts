import { homedir } from "os";
import { join } from "path";
import { pathToFileURL } from "url";
import type { Plugin, PluginMeta, PluginHooks, PluginContext, SearchQuery, SearchResult } from "../plugin";
import { Bus } from "./bus";
import { PluginLoaded, PluginToggled } from "./bus/events";

/**
 * Plugin registration with runtime state
 */
export interface PluginRegistration {
  meta: PluginMeta;
  hooks: PluginHooks;
  enabled: boolean;
  source: "builtin" | "external";
  path?: string;
}

/**
 * Plugin search error
 */
export interface PluginSearchError {
  pluginId: string;
  pluginDisplayName: string;
  error: Error;
}

/**
 * Plugin search result group from a single plugin
 */
export interface PluginSearchResultGroup {
  pluginId: string;
  pluginDisplayName: string;
  results: SearchResult[];
}

/**
 * Glob pattern for plugin files
 */
const PLUGIN_GLOB = new Bun.Glob("*.{ts,js}");

/**
 * Default plugin directories
 */
function getPluginDirectories(): string[] {
  const home = homedir();
  return [
    join(home, ".config", "findr", "plugins"),
    join(home, ".config", "findr", "plugin"),
  ];
}

/**
 * Get config directory
 */
function getConfigDir(): string {
  return join(homedir(), ".config", "findr");
}

/**
 * Get cache directory
 */
function getCacheDir(): string {
  return join(homedir(), ".cache", "findr");
}

/**
 * Plugin Loader - discovers and loads plugins from directories
 * Similar to OpenCode's plugin loading mechanism
 */
export namespace PluginLoader {
  const loadedPlugins = new Map<string, PluginRegistration>();
  let initialized = false;

  /**
   * Create plugin context for initialization
   */
  function createContext(): PluginContext {
    return {
      configDir: getConfigDir(),
      cacheDir: getCacheDir(),
      env: Bun.env as Record<string, string | undefined>,
    };
  }

  /**
   * Discover plugin files from a directory
   */
  async function discoverPlugins(dir: string): Promise<string[]> {
    const plugins: string[] = [];
    
    try {
      const dirExists = await Bun.file(dir).exists().catch(() => false);
      if (!dirExists) {
        // Try to check if it's a directory
        const stat = await Bun.file(dir).stat?.().catch(() => null);
        if (!stat) {
          return plugins;
        }
      }

      for await (const item of PLUGIN_GLOB.scan({
        absolute: true,
        followSymlinks: true,
        dot: false,
        cwd: dir,
      })) {
        plugins.push(pathToFileURL(item).href);
      }
    } catch {
      // Directory doesn't exist or can't be read
    }

    return plugins;
  }

  /**
   * Load a single plugin from a file path
   */
  async function loadPluginFromFile(
    filePath: string,
    context: PluginContext,
  ): Promise<PluginRegistration | null> {
    try {
      const mod = await import(filePath);
      
      // Support both default export and named exports
      const seen = new Set<Plugin>();
      
      for (const [_name, fn] of Object.entries<Plugin>(mod)) {
        if (typeof fn !== "function" || seen.has(fn)) {
          continue;
        }
        seen.add(fn);

        try {
          const result = await fn(context);
          
          if (!result.id || !result.displayName || typeof result.search !== "function") {
            console.warn(`Invalid plugin at ${filePath}: missing required fields`);
            continue;
          }

          const { id, displayName, description, isEnabledByDefault, version, author, ...hooks } = result;

          const registration: PluginRegistration = {
            meta: {
              id,
              displayName,
              description,
              isEnabledByDefault,
              version,
              author,
            },
            hooks: hooks as PluginHooks,
            enabled: isEnabledByDefault ?? true,
            source: "external",
            path: filePath,
          };

          return registration;
        } catch (err) {
          console.warn(`Failed to initialize plugin at ${filePath}:`, err);
        }
      }
    } catch (err) {
      console.warn(`Failed to load plugin at ${filePath}:`, err);
    }

    return null;
  }

  /**
   * Register a builtin plugin (from src/plugins/)
   */
  export function registerBuiltin(
    meta: PluginMeta,
    searchFn: (query: SearchQuery) => Promise<SearchResult[]>,
  ): void {
    const registration: PluginRegistration = {
      meta,
      hooks: { search: searchFn },
      enabled: meta.isEnabledByDefault ?? true,
      source: "builtin",
    };

    loadedPlugins.set(meta.id, registration);
  }

  /**
   * Initialize the plugin loader and discover all plugins
   */
  export async function init(): Promise<void> {
    if (initialized) return;

    const context = createContext();
    const directories = getPluginDirectories();

    // Load external plugins from directories
    for (const dir of directories) {
      const pluginPaths = await discoverPlugins(dir);
      
      for (const pluginPath of pluginPaths) {
        const registration = await loadPluginFromFile(pluginPath, context);
        
        if (registration) {
          // Don't override builtin plugins with same id
          if (!loadedPlugins.has(registration.meta.id)) {
            loadedPlugins.set(registration.meta.id, registration);
            
            // Emit plugin loaded event
            await Bus.publish(PluginLoaded, {
              id: registration.meta.id,
              displayName: registration.meta.displayName,
              source: registration.source,
              path: registration.path,
            });
          }
        }
      }
    }

    initialized = true;
  }

  /**
   * Get all registered plugins
   */
  export function list(): PluginRegistration[] {
    return Array.from(loadedPlugins.values()).sort((a, b) =>
      a.meta.id.localeCompare(b.meta.id),
    );
  }

  /**
   * Get a plugin by ID
   */
  export function get(id: string): PluginRegistration | undefined {
    return loadedPlugins.get(id);
  }

  /**
   * Get all enabled plugins
   */
  export function getEnabled(): PluginRegistration[] {
    return list().filter((p) => p.enabled);
  }

  /**
   * Get enabled plugin IDs
   */
  export function getEnabledIds(): string[] {
    return getEnabled().map((p) => p.meta.id);
  }

  /**
   * Check if a plugin is enabled
   */
  export function isEnabled(id: string): boolean {
    return loadedPlugins.get(id)?.enabled ?? false;
  }

  /**
   * Set plugin enabled state
   */
  export async function setEnabled(id: string, enabled: boolean): Promise<void> {
    const registration = loadedPlugins.get(id);
    if (!registration) {
      throw new Error(`Unknown plugin: ${id}`);
    }

    const wasEnabled = registration.enabled;
    registration.enabled = enabled;

    // Call lifecycle hooks
    if (enabled && !wasEnabled && registration.hooks.onEnabled) {
      await registration.hooks.onEnabled();
    } else if (!enabled && wasEnabled && registration.hooks.onDisabled) {
      await registration.hooks.onDisabled();
    }

    // Emit event
    await Bus.publish(PluginToggled, {
      id: registration.meta.id,
      displayName: registration.meta.displayName,
      enabled,
    });
  }

  /**
   * Toggle plugin enabled state
   */
  export async function toggle(id: string): Promise<boolean> {
    const registration = loadedPlugins.get(id);
    if (!registration) {
      throw new Error(`Unknown plugin: ${id}`);
    }

    await setEnabled(id, !registration.enabled);
    return registration.enabled;
  }

  /**
   * Batch set enabled plugins
   */
  export async function setEnabledPlugins(ids: string[]): Promise<void> {
    const desired = new Set(ids);
    
    for (const [id, registration] of loadedPlugins) {
      const shouldEnable = desired.has(id);
      if (registration.enabled !== shouldEnable) {
        await setEnabled(id, shouldEnable);
      }
    }
  }

  /**
   * Clear all plugins (for testing)
   */
  export function clear(): void {
    loadedPlugins.clear();
    initialized = false;
  }

  /**
   * Get plugin count
   */
  export function count(): number {
    return loadedPlugins.size;
  }
}
