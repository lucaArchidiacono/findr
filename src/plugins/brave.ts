import type { SearchPlugin, PluginSearchQuery, PluginSearchResult } from "../core/plugins";

const BRAVE_ENDPOINT = "https://api.search.brave.com/res/v1/web/search";
const DEFAULT_RESULT_LIMIT = 10;

interface BraveWebResult {
  title?: string;
  url?: string;
  description?: string;
  rank?: number;
  page_age?: string;
  profile?: Record<string, unknown> | null;
  meta_url?: {
    last_crawled?: string;
    published?: string;
  } | null;
  [key: string]: unknown;
}

interface BraveSearchResponse {
  web?: {
    results?: BraveWebResult[];
  };
  [key: string]: unknown;
}

const parseTimestamp = (result: BraveWebResult): number | undefined => {
  const candidates = [result.page_age, result.meta_url?.published, result.meta_url?.last_crawled];

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

const normalizeResult = (result: BraveWebResult): PluginSearchResult | undefined => {
  if (!result.title || !result.url) {
    return undefined;
  }

  return {
    title: result.title,
    description: result.description ?? "",
    url: result.url,
    score: typeof result.rank === "number" ? result.rank : undefined,
    timestamp: parseTimestamp(result),
    metadata: result.profile ?? undefined,
  };
};

const braveSearch = async ({
  query,
  limit,
  signal,
}: PluginSearchQuery): Promise<PluginSearchResult[]> => {
  if (signal.aborted) {
    return [];
  }

  const apiKey = Bun.env["BRAVE_API_KEY"];
  if (!apiKey) {
    throw new Error(`Missing Brave API key. Set BRAVE_API_KEY=... to enable the plugin.`);
  }

  const url = new URL(BRAVE_ENDPOINT);
  url.searchParams.set("q", query);
  url.searchParams.set("source", "web");
  url.searchParams.set("summary", "true");

  const desiredLimit = limit ?? DEFAULT_RESULT_LIMIT;
  url.searchParams.set("count", Math.max(1, Math.min(desiredLimit, 20)).toString());

  try {
    const response = await fetch(url, {
      headers: {
        accept: "application/json",
        "x-subscription-token": apiKey,
      },
      signal,
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(
        `Brave request failed (${response.status}): ${errorBody || response.statusText}`,
      );
    }

    const data = (await response.json()) as BraveSearchResponse;
    const results = data.web?.results ?? [];

    return results
      .map(normalizeResult)
      .filter((item): item is PluginSearchResult => Boolean(item))
      .slice(0, desiredLimit);
  } catch (error) {
    if (signal.aborted) {
      return [];
    }

    throw error instanceof Error ? error : new Error(String(error));
  }
};

const bravePlugin: SearchPlugin = {
  id: "brave",
  displayName: "Brave",
  description: "Queries the Brave Search API (requires BRAVE_API_KEY).",
  isEnabledByDefault: false,
  search: braveSearch,
};

export default bravePlugin;
