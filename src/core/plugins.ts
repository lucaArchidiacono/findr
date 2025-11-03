export interface PluginSearchQuery {
  query: string;
  signal: AbortSignal;
  limit?: number;
}

export interface PluginSearchResult {
  id?: string;
  title: string;
  description: string;
  url: string;
  score?: number;
  timestamp?: number;
  metadata?: Record<string, unknown>;
}

export interface SearchPlugin {
  id: string;
  displayName: string;
  description?: string;
  isEnabledByDefault?: boolean;
  search(query: PluginSearchQuery): Promise<PluginSearchResult[]>;
}

export interface PluginRegistration {
  plugin: SearchPlugin;
  enabled: boolean;
}

export interface PluginSearchError {
  pluginId: string;
  pluginDisplayName: string;
  error: Error;
}

export interface PluginSearchResultGroup {
  pluginId: string;
  pluginDisplayName: string;
  results: PluginSearchResult[];
}

export interface PluginSearchResponse {
  results: PluginSearchResultGroup[];
  errors: PluginSearchError[];
}

export class PluginManager {
  private readonly plugins = new Map<string, PluginRegistration>();

  register(plugin: SearchPlugin): void {
    if (this.plugins.has(plugin.id)) {
      throw new Error(`Plugin with id "${plugin.id}" is already registered.`);
    }

    const enabledByDefault = plugin.isEnabledByDefault ?? true;
    this.plugins.set(plugin.id, {
      plugin,
      enabled: enabledByDefault,
    });
  }

  list(): SearchPlugin[] {
    return Array.from(this.plugins.values())
      .sort((a, b) => a.plugin.id.localeCompare(b.plugin.id))
      .map((registration) => registration.plugin);
  }

  getPlugin(id: string): SearchPlugin | undefined {
    return this.plugins.get(id)?.plugin;
  }

  isEnabled(id: string): boolean {
    const registration = this.plugins.get(id);
    return registration ? registration.enabled : false;
  }

  setEnabled(id: string, enabled: boolean): void {
    const registration = this.plugins.get(id);
    if (!registration) {
      throw new Error(`Unknown plugin: ${id}`);
    }
    registration.enabled = enabled;
  }

  toggle(id: string): boolean {
    const registration = this.plugins.get(id);
    if (!registration) {
      throw new Error(`Unknown plugin: ${id}`);
    }
    registration.enabled = !registration.enabled;
    return registration.enabled;
  }

  setEnabledPlugins(pluginIds: string[]): void {
    const desired = new Set(pluginIds);
    for (const [id, registration] of this.plugins.entries()) {
      registration.enabled = desired.has(id);
    }
  }

  getEnabledPluginIds(): string[] {
    return this.getEnabledPlugins().map((plugin) => plugin.id);
  }

  getEnabledPlugins(): SearchPlugin[] {
    return Array.from(this.plugins.values())
      .filter((registration) => registration.enabled)
      .map((registration) => registration.plugin);
  }
}

export type { SearchPlugin as PluginDefinition };
