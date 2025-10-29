import { PluginManager } from "../core/plugins";
import SearchCache from "../core/searchCache";
import bravePlugin from "./brave";
import mockPlugin from "./mock";

export const createPluginManager = (): PluginManager => {
  const cache = new SearchCache();
  const manager = new PluginManager({ cache });

  manager.register(bravePlugin);
  manager.register(mockPlugin);

  return manager;
};

export const builtInPluginIds = {
  brave: bravePlugin.id,
  mock: mockPlugin.id,
} as const;

export type BuiltInPluginId = (typeof builtInPluginIds)[keyof typeof builtInPluginIds];
