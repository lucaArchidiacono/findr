/**
 * Example Findr Plugin
 * 
 * This is an example plugin that demonstrates the Findr plugin interface.
 * Place this file in ~/.config/findr/plugins/ to enable it.
 * 
 * Plugins can:
 * - Search any API or data source
 * - Return results in a standard format
 * - Use hooks for lifecycle events
 * 
 * Plugin Interface:
 * - id: Unique identifier
 * - displayName: Name shown in the UI
 * - description: Help text
 * - isEnabledByDefault: Whether enabled on load
 * - search(query): Main search function
 * - onEnabled/onDisabled: Lifecycle hooks
 * - search.before/search.after: Transform hooks
 */

// When installed in ~/.config/findr/plugins/, use the full path
// For development, use relative path
import type { Plugin, SearchQuery, SearchResult, PluginContext } from "../../src/plugin";

/**
 * Example plugin that returns DuckDuckGo instant answers
 */
export const DuckDuckGoPlugin: Plugin = async (context: PluginContext) => {
  // Access config and environment
  const { env, configDir, cacheDir } = context;
  
  // You can read configuration from the environment
  const maxResults = parseInt(env["DUCKDUCKGO_MAX_RESULTS"] ?? "10", 10);

  return {
    // Plugin metadata
    id: "duckduckgo",
    displayName: "DuckDuckGo",
    description: "Search DuckDuckGo instant answers API (no API key required)",
    isEnabledByDefault: false,
    version: "1.0.0",
    author: "Example",

    // Main search function
    async search(query: SearchQuery): Promise<SearchResult[]> {
      if (query.signal.aborted) {
        return [];
      }

      const url = new URL("https://api.duckduckgo.com/");
      url.searchParams.set("q", query.query);
      url.searchParams.set("format", "json");
      url.searchParams.set("no_html", "1");

      const response = await fetch(url, {
        signal: query.signal,
        headers: {
          "User-Agent": "Findr/1.0",
        },
      });

      if (!response.ok) {
        throw new Error(`DuckDuckGo request failed: ${response.status}`);
      }

      interface DDGResponse {
        Abstract?: string;
        AbstractURL?: string;
        AbstractSource?: string;
        RelatedTopics?: Array<{
          Text?: string;
          FirstURL?: string;
          Icon?: { URL?: string };
        }>;
      }

      const data = (await response.json()) as DDGResponse;
      const results: SearchResult[] = [];

      // Add abstract if available
      if (data.Abstract && data.AbstractURL) {
        results.push({
          title: data.AbstractSource ?? "DuckDuckGo",
          description: data.Abstract,
          url: data.AbstractURL,
          score: 1,
        });
      }

      // Add related topics
      for (const topic of data.RelatedTopics ?? []) {
        if (topic.Text && topic.FirstURL) {
          results.push({
            title: topic.Text.slice(0, 80),
            description: topic.Text,
            url: topic.FirstURL,
            score: 0.5,
          });
        }

        if (results.length >= (query.limit ?? maxResults)) {
          break;
        }
      }

      return results;
    },

    // Optional: Called when plugin is enabled
    async onEnabled() {
      console.log("DuckDuckGo plugin enabled");
    },

    // Optional: Called when plugin is disabled
    async onDisabled() {
      console.log("DuckDuckGo plugin disabled");
    },

    // Optional: Transform query before search
    // "search.before": async (input, output) => {
    //   // Modify the query if needed
    //   output.query = input.query.toLowerCase();
    // },

    // Optional: Transform results after search
    // "search.after": async (input, output) => {
    //   // Modify results if needed
    //   output.results = output.results.map(r => ({
    //     ...r,
    //     title: `[DDG] ${r.title}`,
    //   }));
    // },
  };
};

// Export as default for simple import
export default DuckDuckGoPlugin;
