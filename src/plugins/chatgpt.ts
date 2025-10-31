import { z } from "zod";
import { generateObject } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import type { SearchPlugin, SearchQuery, SearchResult } from "../core/plugins";

const API_KEY_ENV = "OPENAI_API_KEY";
const DEFAULT_RESULT_LIMIT = 10;
const MODEL_NAME = "gpt-4.1-mini";

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
  if (!value) {
    return undefined;
  }

  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? undefined : parsed;
};

const chatgptSearch = async ({ query, limit, signal }: SearchQuery): Promise<SearchResult[]> => {
  if (signal.aborted) {
    return [];
  }

  const apiKey = Bun.env[API_KEY_ENV];
  if (!apiKey) {
    throw new Error(`Missing OpenAI API key. Set ${API_KEY_ENV}=... to enable the plugin.`);
  }

  const desiredLimit = Math.max(1, Math.min(limit ?? DEFAULT_RESULT_LIMIT, 20));
  const openai = createOpenAI({ apiKey });
  const schema = createResultSchema(desiredLimit);

  try {
    const { object } = await generateObject({
      model: openai(MODEL_NAME),
      messages: [
        {
          role: "system",
          content:
            "You are a web search assistant. Provide high quality, well sourced web results as structured JSON.",
        },
        {
          role: "user",
          content: `Query: ${query}\nReturn up to ${desiredLimit} relevant web results. Focus on recent, reputable sources when possible.`,
        },
      ],
      schema,
      abortSignal: signal,
    });

    const items = object.results ?? [];
    return items.slice(0, desiredLimit).map((item, idx) => ({
      id: `chatgpt-${idx}`,
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

const chatgptPlugin: SearchPlugin = {
  id: "chatgpt",
  displayName: "ChatGPT",
  description: "Uses OpenAI's ChatGPT models to synthesise web-style results (requires OPENAI_API_KEY).",
  isEnabledByDefault: false,
  search: chatgptSearch,
};

export default chatgptPlugin;
