import type { PluginDef, PluginResult } from "../core/findr";

export const MOCK_DATA: PluginResult[] = [
  {
    title: "Building pluggable TUIs with OpenTUI",
    description: "A step-by-step guide on architecting modular terminal UIs with plugins.",
    url: "https://example.com/guides/pluggable-tui",
    score: 12,
  },
  {
    title: "Search API landscape in 2025",
    description: "Compare Brave, Google, Exa, and other search APIs for developer tooling.",
    url: "https://example.com/articles/search-api-landscape-2025",
    score: 20,
  },
  {
    title: "Efficient CLI productivity workflows",
    description: "Learn how to navigate CLI applications using Vim-style motions.",
    url: "https://example.com/blog/cli-productivity",
    score: 3,
  },
  {
    title: "Integrating vector databases with Meilisearch",
    description: "Blend keyword and semantic search results via a custom plugin architecture.",
    url: "https://example.com/tutorials/meilisearch-integration",
    score: 0.4,
  },
  {
    title: "Prompt engineering for meta-search",
    description: "Strategies for orchestrating LLM-powered search pipelines effectively.",
    url: "https://example.com/prompts/meta-search",
    score: 5.3,
  },
];

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const mockPlugin: PluginDef = {
  name: "mock",
  displayName: "Local Mock",
  description: "Returns deterministic sample results for development and testing.",
  enabled: true,
  search: async (query, signal) => {
    if (signal.aborted) return [];
    await delay(120);

    const normalized = query.trim().toLowerCase();
    let results: PluginResult[];

    if (!normalized) {
      results = MOCK_DATA.map((item, idx) => ({
        ...item,
        id: `mock-${idx}`,
        score: 1,
        timestamp: Date.now(),
      }));
    } else {
      results = MOCK_DATA.filter((item) => {
        const haystack = `${item.title} ${item.description}`.toLowerCase();
        return haystack.includes(normalized);
      }).map((item, idx) => ({
        ...item,
        id: `mock-${idx}`,
        score: 1,
        timestamp: Date.now(),
      }));
    }

    return results.slice(0, 10);
  },
};

export default mockPlugin;
