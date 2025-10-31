import { PluginManager } from "../core/plugins";
import SearchCache from "../core/searchCache";
import bravePlugin from "./brave";
import kagiPlugin from "./kagi";
import perplexityPlugin from "./perplexity";
import mockPlugin from "./mock";

export const createPluginManager = (): PluginManager => {
  const cache = new SearchCache();
  const manager = new PluginManager({ cache });

  manager.register(bravePlugin);
  manager.register(kagiPlugin);
  manager.register(perplexityPlugin);
  manager.register(mockPlugin);

  return manager;
};

export const builtInPluginIds = {
  brave: bravePlugin.id,
  kagi: kagiPlugin.id,
  perplexity: perplexityPlugin.id,
  mock: mockPlugin.id,
} as const;

export type BuiltInPluginId = (typeof builtInPluginIds)[keyof typeof builtInPluginIds];
