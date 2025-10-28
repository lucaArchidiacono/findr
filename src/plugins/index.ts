import { PluginManager } from "../core/plugins";
import mockPlugin from "./mock";

export const createPluginManager = (): PluginManager => {
  const manager = new PluginManager();

  manager.register(mockPlugin);

  return manager;
};

export const builtInPluginIds = {
  mock: mockPlugin.id,
} as const;

export type BuiltInPluginId = (typeof builtInPluginIds)[keyof typeof builtInPluginIds];
