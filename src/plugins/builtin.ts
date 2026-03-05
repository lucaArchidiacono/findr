import { Findr } from "../core/findr";
import bravePlugin from "./brave";
import duckduckgoPlugin from "./duckduckgo";
import perplexityPlugin from "./perplexity";

export function registerBuiltinPlugins(): void {
  Findr.register(bravePlugin);
  Findr.register(duckduckgoPlugin);
  Findr.register(perplexityPlugin);
}
