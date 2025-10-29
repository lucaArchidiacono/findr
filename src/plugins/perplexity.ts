import type { SearchPlugin, SearchQuery, SearchResult } from "../core/plugins";

const PPLX_ENDPOINT = "https://api.perplexity.ai/chat/completions";
const API_KEY_ENV = "PERPLEXITY_API_KEY";
const DEFAULT_RESULT_LIMIT = 10;
const DEFAULT_MODEL = "pplx-70b-online"; // Online model with browsing/search capability

const resolveApiKey = (): string | undefined => {
  if (typeof Bun !== "undefined" && Bun.env) {
    return Bun.env[API_KEY_ENV];
  }

  if (typeof process !== "undefined" && "env" in process) {
    return process.env[API_KEY_ENV];
  }

  return undefined;
};

interface PplxMessage {
  role?: string;
  content?: string;
  // Some SDKs place citations here
  citations?: unknown;
  [key: string]: unknown;
}

interface PplxChoice {
  index?: number;
  message?: PplxMessage;
  // Some responses attach citations at the choice level
  citations?: unknown;
  [key: string]: unknown;
}

interface PplxResponse {
  choices?: PplxChoice[];
  // Some responses attach citations/sources at top-level
  citations?: unknown;
  source_attributions?: unknown;
  [key: string]: unknown;
}

const tryParseJsonBlock = (text: string): unknown => {
  // Handle fenced code blocks
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenceMatch ? fenceMatch[1] : text;

  // Find first JSON object or array
  const startIdx = candidate.indexOf("{") >= 0 ? candidate.indexOf("{") : candidate.indexOf("[");
  const endIdx = candidate.lastIndexOf("}") >= 0 ? candidate.lastIndexOf("}") : candidate.lastIndexOf("]");
  if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) {
    return undefined;
  }
  const jsonSlice = candidate.slice(startIdx, endIdx + 1);
  try {
    return JSON.parse(jsonSlice);
  } catch {
    return undefined;
  }
};

const parseTimestamp = (value: unknown): number | undefined => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const ts = Date.parse(value);
    return Number.isNaN(ts) ? undefined : ts;
  }
  return undefined;
};

const getProp = (obj: unknown, key: string): unknown => {
  return obj && typeof obj === "object" ? (obj as Record<string, unknown>)[key] : undefined;
};

const getString = (obj: unknown, key: string): string | undefined => {
  const value = getProp(obj, key);
  return typeof value === "string" ? value : undefined;
};

const getNumber = (obj: unknown, key: string): number | undefined => {
  const value = getProp(obj, key);
  return typeof value === "number" ? value : undefined;
};

const normalizeFromJsonResults = (json: unknown, limit: number): SearchResult[] => {
  const out: SearchResult[] = [];
  const set = new Set<string>();

  const items: unknown[] | undefined = Array.isArray(json)
    ? json
    : typeof json === "object" && json !== null && Array.isArray((json as Record<string, unknown>).results as unknown[])
      ? ((json as Record<string, unknown>).results as unknown[])
      : undefined;

  if (!items) return out;

  for (const item of items) {
    if (out.length >= limit) break;
    if (!item || typeof item !== "object") continue;
    const url: string | undefined =
      getString(item, "url") ?? getString(item, "link") ?? getString(item, "source");
    const title: string | undefined = getString(item, "title") ?? getString(item, "name");
    const description: string | undefined =
      getString(item, "description") ?? getString(item, "snippet") ?? getString(item, "text");
    const published: unknown =
      getProp(item, "published_at") ??
      getProp(item, "published") ??
      getProp(item, "date") ??
      getProp(item, "time");
    const score: number | undefined =
      getNumber(item, "score") ?? getNumber(item, "rank") ?? getNumber(item, "confidence");

    if (typeof url !== "string" || !url) continue;
    if (set.has(url)) continue;

    out.push({
      title: typeof title === "string" && title ? title : new URL(url).hostname,
      description: typeof description === "string" ? description : "",
      url,
      score: typeof score === "number" ? score : undefined,
      timestamp: parseTimestamp(published),
    });
    set.add(url);
  }

  return out;
};

const normalizeFromAttributions = (atts: unknown, limit: number): SearchResult[] => {
  if (!atts) return [];
  const array = Array.isArray(atts) ? atts : [];
  const out: SearchResult[] = [];
  const set = new Set<string>();

  for (const item of array) {
    if (out.length >= limit) break;
    if (typeof item === "string") {
      const url = item;
      if (!/^https?:\/\//i.test(url)) continue;
      if (set.has(url)) continue;
      out.push({ title: new URL(url).hostname, description: "", url });
      set.add(url);
      continue;
    }

    if (!item || typeof item !== "object") continue;
    const url: string | undefined =
      getString(item, "url") ?? getString(item, "source") ?? getString(item, "link");
    if (typeof url !== "string" || !url) continue;
    if (set.has(url)) continue;

    const title: string | undefined = getString(item, "title") ?? getString(item, "name");
    const description: string | undefined =
      getString(item, "description") ?? getString(item, "snippet") ?? getString(item, "text");
    const published: unknown =
      getProp(item, "published_at") ??
      getProp(item, "published") ??
      getProp(item, "date") ??
      getProp(item, "time");
    const score: number | undefined =
      getNumber(item, "score") ?? getNumber(item, "rank") ?? getNumber(item, "confidence");

    out.push({
      title: typeof title === "string" && title ? title : new URL(url).hostname,
      description: typeof description === "string" ? description : "",
      url,
      score: typeof score === "number" ? score : undefined,
      timestamp: parseTimestamp(published),
    });
    set.add(url);
  }

  return out;
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

  const body = {
    model: DEFAULT_MODEL,
    temperature: 0,
    messages: [
      {
        role: "system",
        content:
          "You are a web search assistant. Return only JSON, no commentary. Schema: {\n  \"results\": [ { \"title\": string, \"url\": string, \"description\": string, \"published_at\"?: string, \"score\"?: number } ]\n}",
      },
      {
        role: "user",
        content: `Find web results for: ${query}\nReturn up to ${desiredLimit} items as JSON in the schema above. No extra text.`,
      },
    ],
    // n: 1,  // default
    // Some servers accept these hints; safe to include if ignored
    top_k: desiredLimit,
    search_recency_filter: "month",
  } as const;

  try {
    const response = await fetch(PPLX_ENDPOINT, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal,
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(
        `Perplexity request failed (${response.status}): ${errorBody || response.statusText}`,
      );
    }

    const data = (await response.json()) as PplxResponse;
    const primaryContent =
      typeof data?.choices?.[0]?.message?.content === "string"
        ? (data.choices as PplxChoice[])[0].message?.content ?? ""
        : "";

    // Strategy 1: parse structured JSON from content
    const parsed = primaryContent ? tryParseJsonBlock(primaryContent) : undefined;
    let results = normalizeFromJsonResults(parsed, desiredLimit);

    // Strategy 2: fall back to any citations/attributions provided
    if (results.length === 0) {
      const firstChoice = Array.isArray(data?.choices) ? data.choices?.[0] : undefined;
      let citations: unknown = undefined;
      if (firstChoice && typeof firstChoice === "object") {
        const msg = (firstChoice as PplxChoice).message;
        if (msg && typeof msg === "object") {
          citations = (msg as PplxMessage).citations;
        }
        if (!citations && "citations" in (firstChoice as Record<string, unknown>)) {
          citations = (firstChoice as Record<string, unknown>).citations;
        }
      }
      const attributions: unknown = (data as PplxResponse).source_attributions;
      if (citations) {
        results = normalizeFromAttributions(citations, desiredLimit);
      }
      if (results.length === 0 && attributions) {
        results = normalizeFromAttributions(attributions, desiredLimit);
      }
    }

    return results.slice(0, desiredLimit);
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
  description: "Queries Perplexity chat API for web results (requires PERPLEXITY_API_KEY).",
  isEnabledByDefault: false,
  search: perplexitySearch,
};

export default perplexityPlugin;
