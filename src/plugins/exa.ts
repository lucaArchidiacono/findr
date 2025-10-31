import type { SearchPlugin, SearchQuery, SearchResult } from "../core/plugins";

const API_KEY_ENV = "EXA_API_KEY";
const EXA_ENDPOINT = "https://api.exa.ai/search";
const DEFAULT_RESULT_LIMIT = 10;

interface ExaSearchResult {
  id?: string;
  title?: string;
  url?: string;
  summary?: string;
  snippet?: string;
  text?: string;
  highlight?: string | string[];
  highlights?: string[];
  score?: number;
  publishedDate?: string;
  publishedAt?: string;
  updatedAt?: string;
  publishedTimestamp?: number;
  updatedTimestamp?: number;
  author?: string;
  source?: string;
  [key: string]: unknown;
}

interface ExaSearchResponse {
  results?: ExaSearchResult[];
  [key: string]: unknown;
}

const parseTimestamp = (value: string | number | undefined): number | undefined => {
  if (typeof value === "number") {
    const millis = value > 1_000_000_000_000 ? value : value * 1000;
    return Number.isFinite(millis) ? millis : undefined;
  }

  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? undefined : parsed;
  }

  return undefined;
};

const stripHtml = (value: string): string => value.replace(/<[^>]*>/g, "").trim();

const buildDescription = (result: ExaSearchResult): string => {
  const candidates: Array<string | undefined> = [];

  if (typeof result.summary === "string") {
    candidates.push(result.summary);
  }
  if (typeof result.text === "string") {
    candidates.push(result.text);
  }
  if (typeof result.snippet === "string") {
    candidates.push(result.snippet);
  }
  if (typeof result.highlight === "string") {
    candidates.push(stripHtml(result.highlight));
  } else if (Array.isArray(result.highlight)) {
    candidates.push(result.highlight.map(stripHtml).join(" ").trim());
  }
  if (Array.isArray(result.highlights)) {
    candidates.push(result.highlights.map(stripHtml).join(" ").trim());
  }

  return candidates.find((entry) => entry && entry.trim().length > 0)?.trim() ?? "";
};

const normalizeResult = (result: ExaSearchResult): SearchResult | undefined => {
  if (!result.title || !result.url) {
    return undefined;
  }

  const timestampCandidates = [
    parseTimestamp(result.publishedTimestamp),
    parseTimestamp(result.updatedTimestamp),
    parseTimestamp(result.publishedDate),
    parseTimestamp(result.publishedAt),
    parseTimestamp(result.updatedAt),
  ];

  const timestamp = timestampCandidates.find((value) => typeof value === "number");

  const metadata: Record<string, unknown> = {};
  if (result.id) {
    metadata.exaId = result.id;
  }
  if (result.author) {
    metadata.author = result.author;
  }
  if (result.source) {
    metadata.source = result.source;
  }

  return {
    id: result.id,
    title: result.title,
    description: buildDescription(result),
    url: result.url,
    score: typeof result.score === "number" ? result.score : undefined,
    timestamp,
    metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
  };
};

const exaSearch = async ({ query, limit, signal }: SearchQuery): Promise<SearchResult[]> => {
  if (signal.aborted) {
    return [];
  }

  const apiKey = Bun.env[API_KEY_ENV];
  if (!apiKey) {
    throw new Error(`Missing Exa API key. Set ${API_KEY_ENV}=... to enable the plugin.`);
  }

  const desiredLimit = Math.max(1, Math.min(limit ?? DEFAULT_RESULT_LIMIT, 20));

  try {
    const response = await fetch(EXA_ENDPOINT, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "x-api-key": apiKey,
      },
      body: JSON.stringify({
        query,
        numResults: desiredLimit,
        useAutoprompt: true,
      }),
      signal,
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Exa request failed (${response.status}): ${errorBody || response.statusText}`);
    }

    const data = (await response.json()) as ExaSearchResponse;
    const results = data.results ?? [];

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

const exaPlugin: SearchPlugin = {
  id: "exa",
  displayName: "Exa",
  description: "Queries Exa's search API (requires EXA_API_KEY).",
  isEnabledByDefault: false,
  search: exaSearch,
};

export default exaPlugin;
