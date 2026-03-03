import type { PluginDef } from "../core/findr";

interface BraveResult {
  title?: string;
  url?: string;
  description?: string;
  rank?: number;
  page_age?: string;
  meta_url?: { last_crawled?: string; published?: string } | null;
}

export interface BraveSearchResponse {
  web?: { results?: BraveResult[] };
}

export function parseBraveResults(data: BraveSearchResponse): {
  title: string;
  description: string;
  url: string;
  score?: number;
  timestamp?: number;
}[] {
  const results = data.web?.results ?? [];

  return results
    .filter((r): r is BraveResult & { title: string; url: string } => Boolean(r.title && r.url))
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
    });
}

const bravePlugin: PluginDef = {
  name: "brave",
  displayName: "Brave",
  description: "Queries the Brave Search API (requires BRAVE_API_KEY).",
  enabled: false,
  search: async (query, signal) => {
    if (signal.aborted) return [];

    const apiKey = Bun.env["BRAVE_API_KEY"];
    if (!apiKey) {
      throw new Error("Missing Brave API key. Set BRAVE_API_KEY=... to enable the plugin.");
    }

    const url = new URL("https://api.search.brave.com/res/v1/web/search");
    url.searchParams.set("q", query);
    url.searchParams.set("source", "web");
    url.searchParams.set("summary", "true");
    url.searchParams.set("count", "10");

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
    return parseBraveResults(data).slice(0, 10);
  },
};

export default bravePlugin;
