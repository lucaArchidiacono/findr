import { z } from "zod";
import { generateObject } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import type { CoreMessage } from "ai";

const API_KEY_ENV = "PERPLEXITY_API_KEY";
const DEFAULT_RESULT_LIMIT = 10;
const DEFAULT_MODEL = "pplx-70b-online"; // Perplexity online model

const resolveApiKey = (): string | undefined => {
  if (typeof Bun !== "undefined" && Bun.env) {
    return Bun.env[API_KEY_ENV];
  }
  if (typeof process !== "undefined" && "env" in process) {
    return process.env[API_KEY_ENV];
  }
  return undefined;
};

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

const perplexitySearch = async ({ query, limit, signal }: SearchQuery): Promise<SearchResult[]> => {
  if (signal.aborted) {
    return [];
  }

  const apiKey = resolveApiKey();
  if (!apiKey) {
    throw new Error(`Missing Perplexity API key. Set ${API_KEY_ENV}=... to enable the plugin.`);
  }

  const desiredLimit = Math.max(1, Math.min(limit ?? DEFAULT_RESULT_LIMIT, 20));

  const openai = createOpenAI({
    baseURL: "https://api.perplexity.ai",
    apiKey,
  });

  const system: CoreMessage = {
    role: "system",
    content:
      "You are a web search assistant. Provide web results as structured JSON matching the schema.",
  };
  const user: CoreMessage = {
    role: "user",
    content: `Query: ${query}\nReturn up to ${desiredLimit} results. Focus on relevant, high quality sources.`,
  };

  const schema = createResultSchema(desiredLimit);

  try {
    const { object } = await generateObject({
      model: openai(DEFAULT_MODEL),
      messages: [system, user],
      schema,
      signal,
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
  displayName: "Perplexity Search",
  description:
    "Uses Vercel AI SDK with Zod schema to fetch structured web results (requires PERPLEXITY_API_KEY).",
  isEnabledByDefault: false,
  search: perplexitySearch,
};

export default perplexityPlugin;
