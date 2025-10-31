import { PluginManager } from "./plugins";
import SearchCache from "./searchCache";
import plugins from "../plugins";

class Backend {
  private readonly cache: SearchCache;
  private readonly pluginManager: PluginManager;

  constructor() {
    this.cache = new SearchCache();
    const manager = new PluginManager({ cache: this.cache });

    plugins.forEach((plugin) => {
      manager.register(plugin);
    });

    this.pluginManager = manager;
  }

  search(query: string, options: { signal?: AbortSignal; limit?: number } = {}) {
    return this.pluginManager.search(query, options);
  }

  getEnabledPluginIds() {
    return this.pluginManager.getEnabledPluginIds();
  }

  getPlugins() {
    return this.pluginManager.list();
  }

  getPlugin(id: string) {
    return this.pluginManager.getPlugin(id);
  }

  setPluginEnabled(id: string, enabled: boolean) {
    return this.pluginManager.setEnabled(id, enabled);
  }

  togglePlugin(id: string) {
    return this.pluginManager.toggle(id);
  }
}

const backend = new Backend();

export const useBackend = () => {
  return backend;
};
