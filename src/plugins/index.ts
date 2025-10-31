import { PluginManager } from "../core/plugins";
import SearchCache from "../core/searchCache";
import bravePlugin from "./brave";
import exaPlugin from "./exa";
import mockPlugin from "./mock";
import perplexityPlugin from "./perplexity";

export const createPluginManager = (): PluginManager => {
  const cache = new SearchCache();
  const manager = new PluginManager({ cache });

  manager.register(bravePlugin);
  manager.register(exaPlugin);
  manager.register(perplexityPlugin);
  manager.register(mockPlugin);

  return manager;
};

export const builtInPluginIds = {
  brave: bravePlugin.id,
  exa: exaPlugin.id,
  mock: mockPlugin.id,
  perplexity: perplexityPlugin.id,
} as const;

export type BuiltInPluginId = (typeof builtInPluginIds)[keyof typeof builtInPluginIds];
