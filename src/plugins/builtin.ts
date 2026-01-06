/**
 * Builtin plugins registration
 * 
 * This module registers all builtin plugins with the PluginLoader
 * Builtin plugins are registered directly, while external plugins
 * are loaded from ~/.config/findr/plugins/
 */

import { PluginLoader } from "../core/plugin-loader";
import type { SearchQuery, SearchResult } from "../plugin";

// Mock data for development/testing
const MOCK_DATA: Omit<SearchResult, "id">[] = [
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

/**
 * Register all builtin plugins
 */
export function registerBuiltinPlugins(): void {
  // Mock plugin
  PluginLoader.registerBuiltin(
    {
      id: "mock",
      displayName: "Local Mock",
      description: "Returns deterministic sample results for development and testing.",
      isEnabledByDefault: true,
    },
    async (query: SearchQuery): Promise<SearchResult[]> => {
      if (query.signal.aborted) {
        return [];
      }

      await delay(120);

      const normalizedQuery = query.query.trim().toLowerCase();

      let results: SearchResult[];
      if (!normalizedQuery) {
        results = MOCK_DATA.map((item, idx) => ({
          ...item,
          id: `mock-${idx}`,
          score: 1,
          timestamp: Date.now(),
        }));
      } else {
        results = MOCK_DATA.filter((item) => {
          const haystack = `${item.title} ${item.description}`.toLowerCase();
          return haystack.includes(normalizedQuery);
        }).map((item, idx) => ({
          ...item,
          id: `mock-${idx}`,
          score: 1,
          timestamp: Date.now(),
        }));
      }

      return results.slice(0, query.limit ?? 10);
    },
  );

  // Brave Search plugin
  PluginLoader.registerBuiltin(
    {
      id: "brave",
      displayName: "Brave",
      description: "Queries the Brave Search API (requires BRAVE_API_KEY).",
      isEnabledByDefault: false,
    },
    async (query: SearchQuery): Promise<SearchResult[]> => {
      if (query.signal.aborted) {
        return [];
      }

      const apiKey = Bun.env["BRAVE_API_KEY"];
      if (!apiKey) {
        throw new Error("Missing Brave API key. Set BRAVE_API_KEY=... to enable the plugin.");
      }

      const url = new URL("https://api.search.brave.com/res/v1/web/search");
      url.searchParams.set("q", query.query);
      url.searchParams.set("source", "web");
      url.searchParams.set("summary", "true");

      const limit = Math.max(1, Math.min(query.limit ?? 10, 20));
      url.searchParams.set("count", limit.toString());

      const response = await fetch(url, {
        headers: {
          accept: "application/json",
          "x-subscription-token": apiKey,
        },
        signal: query.signal,
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(
          `Brave request failed (${response.status}): ${errorBody || response.statusText}`,
        );
      }

      interface BraveResult {
        title?: string;
        url?: string;
        description?: string;
        rank?: number;
        page_age?: string;
        meta_url?: { last_crawled?: string; published?: string } | null;
      }

      const data = (await response.json()) as { web?: { results?: BraveResult[] } };
      const results = data.web?.results ?? [];

      return results
        .filter((r): r is BraveResult & { title: string; url: string } =>
          Boolean(r.title && r.url),
        )
        .map((r, idx) => {
          const timestamps = [r.page_age, r.meta_url?.published, r.meta_url?.last_crawled];
          let timestamp: number | undefined;
          for (const ts of timestamps) {
            if (ts) {
              const parsed = Date.parse(ts);
              if (!Number.isNaN(parsed)) {
                timestamp = parsed;
                break;
              }
            }
          }

          return {
            id: `brave-${idx}`,
            title: r.title,
            description: r.description ?? "",
            url: r.url,
            score: typeof r.rank === "number" ? r.rank : undefined,
            timestamp,
          };
        })
        .slice(0, limit);
    },
  );

  // Perplexity plugin
  PluginLoader.registerBuiltin(
    {
      id: "perplexity",
      displayName: "Perplexity",
      description:
        "Uses Vercel AI SDK with Zod schema to fetch structured web results (requires PERPLEXITY_API_KEY).",
      isEnabledByDefault: false,
    },
    async (query: SearchQuery): Promise<SearchResult[]> => {
      if (query.signal.aborted) {
        return [];
      }

      const apiKey = Bun.env["PERPLEXITY_API_KEY"];
      if (!apiKey) {
        throw new Error(
          "Missing Perplexity API key. Set PERPLEXITY_API_KEY=... to enable the plugin.",
        );
      }

      // Dynamic import to avoid loading AI SDK unless needed
      const { z } = await import("zod");
      const { generateObject } = await import("ai");
      const { createPerplexity } = await import("@ai-sdk/perplexity");

      const limit = Math.max(1, Math.min(query.limit ?? 10, 20));

      const schema = z.object({
        results: z
          .array(
            z.object({
              title: z.string().min(1),
              url: z.string().url(),
              description: z.string().default(""),
              publishedAt: z.string().optional(),
              score: z.number().optional(),
            }),
          )
          .min(0)
          .max(limit),
      });

      const perplexity = createPerplexity({ apiKey });

      const { object } = await generateObject({
        model: perplexity("sonar"),
        messages: [
          {
            role: "system",
            content:
              "You are a web search assistant. Provide web results as structured JSON matching the schema.",
          },
          {
            role: "user",
            content: `Query: ${query.query}\nReturn up to ${limit} results. Focus on relevant, high quality sources.`,
          },
        ],
        schema,
        abortSignal: query.signal,
      });

      return (object.results ?? []).slice(0, limit).map((item, idx) => ({
        id: `perplexity-${idx}`,
        title: item.title,
        description: item.description ?? "",
        url: item.url,
        score: typeof item.score === "number" ? item.score : undefined,
        timestamp: item.publishedAt ? Date.parse(item.publishedAt) : undefined,
      }));
    },
  );
}

/**
 * Get list of builtin plugin metadata (for backwards compatibility)
 */
export function getBuiltinPlugins() {
  return [
    {
      id: "mock",
      displayName: "Local Mock",
      description: "Returns deterministic sample results for development and testing.",
      isEnabledByDefault: true,
    },
    {
      id: "brave",
      displayName: "Brave",
      description: "Queries the Brave Search API (requires BRAVE_API_KEY).",
      isEnabledByDefault: false,
    },
    {
      id: "perplexity",
      displayName: "Perplexity",
      description:
        "Uses Vercel AI SDK with Zod schema to fetch structured web results (requires PERPLEXITY_API_KEY).",
      isEnabledByDefault: false,
    },
  ];
}
