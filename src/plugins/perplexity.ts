import { z } from "zod";
import { generateObject } from "ai";
import { createPerplexity } from "@ai-sdk/perplexity";
import type { SearchPlugin, PluginSearchQuery, PluginSearchResult } from "../core/plugins";

const API_KEY_ENV = "PERPLEXITY_API_KEY";
const DEFAULT_RESULT_LIMIT = 10;

const ResultItemSchema = z.object({
  title: z.string().min(1),
  url: z.string().url(),
  description: z.string().default(""),
  publishedAt: z.string().optional(),
  score: z.number().optional(),
});

const createResultSchema = (limit: number) =>
  z.object({
    results: z.array(ResultItemSchema).min(0).max(limit),
  });

const parseTimestamp = (value: string | undefined): number | undefined => {
  if (!value) return undefined;
  const ts = Date.parse(value);
  return Number.isNaN(ts) ? undefined : ts;
};

const perplexitySearch = async ({
  query,
  limit,
  signal,
}: PluginSearchQuery): Promise<PluginSearchResult[]> => {
  if (signal.aborted) {
    return [];
  }

  const apiKey = Bun.env[API_KEY_ENV];
  if (!apiKey) {
    throw new Error(`Missing Perplexity API key. Set ${API_KEY_ENV}=... to enable the plugin.`);
  }

  const desiredLimit = Math.max(1, Math.min(limit ?? DEFAULT_RESULT_LIMIT, 20));

  const perplexity = createPerplexity({
    apiKey,
  });

  const schema = createResultSchema(desiredLimit);

  try {
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
          content: `Query: ${query}\nReturn up to ${desiredLimit} results. Focus on relevant, high quality sources.`,
        },
      ],
      schema,
      abortSignal: signal,
    });

    const items = object.results ?? [];
    return items.slice(0, desiredLimit).map((item, idx) => ({
      id: `perplexity-${idx}`,
      title: item.title,
      description: item.description ?? "",
      url: item.url,
      score: typeof item.score === "number" ? item.score : undefined,
      timestamp: parseTimestamp(item.publishedAt),
    }));
  } catch (error) {
    if (signal.aborted) {
      return [];
    }
    throw error instanceof Error ? error : new Error(String(error));
  }
};

const perplexityPlugin: SearchPlugin = {
  id: "perplexity",
  displayName: "Perplexity",
  description:
    "Uses Vercel AI SDK with Zod schema to fetch structured web results (requires PERPLEXITY_API_KEY).",
  isEnabledByDefault: false,
  search: perplexitySearch,
};

export default perplexityPlugin;
