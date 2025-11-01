import type { SearchPlugin, PluginSearchQuery, PluginSearchResult } from "../core/plugins";

const MOCK_DATA: Omit<PluginSearchResult, "id">[] = [
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

const filterResults = (query: string): PluginSearchResult[] => {
  const normalizedQuery = query.trim().toLowerCase();

  if (!normalizedQuery) {
    return MOCK_DATA.map((item, idx) => ({
      ...item,
      id: `mock-${idx}`,
      score: 1,
      timestamp: Date.now(),
    }));
  }

  return MOCK_DATA.filter((item) => {
    const haystack = `${item.title} ${item.description}`.toLowerCase();
    return haystack.includes(normalizedQuery);
  }).map((item, idx) => ({
    ...item,
    id: `mock-${idx}`,
    score: 1,
    timestamp: Date.now(),
  }));
};

async function mockSearch(query: PluginSearchQuery): Promise<PluginSearchResult[]> {
  if (query.signal.aborted) {
    return [];
  }

  await delay(120);

  return filterResults(query.query).slice(0, query.limit ?? 10);
}

export const mockPlugin: SearchPlugin = {
  id: "mock",
  displayName: "Local Mock",
  description: "Returns deterministic sample results for development and testing.",
  isEnabledByDefault: true,
  search: mockSearch,
};

export default mockPlugin;
