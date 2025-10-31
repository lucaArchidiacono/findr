import { PluginManager } from "./plugins";
import { KeyValueStorage } from "./keyValueStorage";
import plugins from "../plugins";

class Backend {
  private readonly pluginManager: PluginManager;

  constructor() {
    this.pluginManager = new PluginManager({
      cache: new KeyValueStorage({ filename: "findr-cache.json" }),
    });
    plugins.forEach((plugin) => {
      this.pluginManager.register(plugin);
    });
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
