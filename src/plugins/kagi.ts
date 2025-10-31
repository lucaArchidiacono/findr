import type { SearchPlugin, SearchQuery, SearchResult } from "../core/plugins";

const KAGI_ENDPOINT = "https://kagi.com/api/v0/search";
const API_KEY_ENV = "KAGI_API_KEY";
const DEFAULT_RESULT_LIMIT = 10;

interface KagiStructuredResults {
  results?: KagiSearchResult[];
  organic?: KagiSearchResult[];
  non_personalized_results?: KagiSearchResult[];
  [key: string]: unknown;
}

interface KagiSearchResponse {
  data?: KagiSearchResult[] | KagiStructuredResults;
  [key: string]: unknown;
}

interface KagiSearchResult {
  id?: string | number;
  title?: string;
  url?: string;
  snippet?: string;
  description?: string;
  displayed_url?: string;
  language?: string;
  source?: string;
  score?: number;
  published?: string;
  published_date?: string;
  published_time?: string;
  date?: string;
  [key: string]: unknown;
}

const parseTimestamp = (result: KagiSearchResult): number | undefined => {
  const candidates = [
    result.published,
    result.published_time,
    result.published_date,
    result.date,
  ];

  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }

    const timestamp = Date.parse(candidate);
    if (!Number.isNaN(timestamp)) {
      return timestamp;
    }
  }

  return undefined;
};

const buildMetadata = (result: KagiSearchResult): Record<string, unknown> | undefined => {
  const metadata: Record<string, unknown> = {};

  if (typeof result.displayed_url === "string" && result.displayed_url.length > 0) {
    metadata.displayedUrl = result.displayed_url;
  }
  if (typeof result.language === "string" && result.language.length > 0) {
    metadata.language = result.language;
  }
  if (typeof result.source === "string" && result.source.length > 0) {
    metadata.source = result.source;
  }

  return Object.keys(metadata).length > 0 ? metadata : undefined;
};

const normalizeResult = (result: KagiSearchResult): SearchResult | undefined => {
  if (!result.title || !result.url) {
    return undefined;
  }

  const normalizedId =
    typeof result.id === "string"
      ? result.id
      : typeof result.id === "number"
        ? result.id.toString(10)
        : undefined;

  const metadata = buildMetadata(result);

  return {
    id: normalizedId,
    title: result.title,
    description: result.snippet ?? result.description ?? "",
    url: result.url,
    score: typeof result.score === "number" ? result.score : undefined,
    timestamp: parseTimestamp(result),
    metadata,
  };
};

const extractResults = (payload: KagiSearchResponse): KagiSearchResult[] => {
  if (!payload?.data) {
    return [];
  }

  if (Array.isArray(payload.data)) {
    return payload.data;
  }

  const structured = payload.data as KagiStructuredResults;

  if (Array.isArray(structured.results)) {
    return structured.results;
  }

  if (Array.isArray(structured.organic)) {
    return structured.organic;
  }

  if (Array.isArray(structured.non_personalized_results)) {
    return structured.non_personalized_results;
  }

  return [];
};

const getEnv = (name: string): string | undefined => {
  if (typeof Bun !== "undefined" && Bun?.env) {
    const value = Bun.env[name];
    if (value) {
      return value;
    }
  }

  return typeof process !== "undefined" ? process.env?.[name] : undefined;
};

const kagiSearch = async ({ query, limit, signal }: SearchQuery): Promise<SearchResult[]> => {
  if (signal.aborted) {
    return [];
  }

  const apiKey = getEnv(API_KEY_ENV);
  if (!apiKey) {
    throw new Error(`Missing Kagi API key. Set ${API_KEY_ENV}=... to enable the plugin.`);
  }

  const desiredLimit = Math.max(1, Math.min(limit ?? DEFAULT_RESULT_LIMIT, 20));

  try {
    const response = await fetch(KAGI_ENDPOINT, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        Authorization: `Bot ${apiKey}`,
      },
      body: JSON.stringify({ query, limit: desiredLimit }),
      signal,
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Kagi request failed (${response.status}): ${errorBody || response.statusText}`);
    }

    const payload = (await response.json()) as KagiSearchResponse;
    const results = extractResults(payload);

    return results
      .map(normalizeResult)
      .filter((item): item is SearchResult => Boolean(item))
      .slice(0, desiredLimit);
  } catch (error) {
    if (signal.aborted) {
      return [];
    }

    throw error instanceof Error ? error : new Error(String(error));
  }
};

const kagiPlugin: SearchPlugin = {
  id: "kagi",
  displayName: "Kagi",
  description: `Queries the Kagi Search API (requires ${API_KEY_ENV}).`,
  isEnabledByDefault: false,
  search: kagiSearch,
};

export default kagiPlugin;
