import type { SearchPlugin, SearchQuery, SearchResult } from "../core/plugins";

const GOOGLE_ENDPOINT = "https://www.googleapis.com/customsearch/v1";
const API_KEY_ENV = "GOOGLE_API_KEY";
const CX_ENV = "GOOGLE_CX";
const DEFAULT_RESULT_LIMIT = 10;

type NullableRecord = Record<string, string | undefined>;

type GoogleStructuredDataEntry = Record<string, unknown>;

interface GooglePageMap {
  metatags?: NullableRecord[];
  newsarticle?: GoogleStructuredDataEntry[];
  blogposting?: GoogleStructuredDataEntry[];
  article?: GoogleStructuredDataEntry[];
  videoobject?: GoogleStructuredDataEntry[];
  [key: string]: unknown;
}

interface GoogleSearchItem {
  title?: string;
  snippet?: string;
  link?: string;
  displayLink?: string;
  formattedUrl?: string;
  cacheId?: string;
  mime?: string;
  fileFormat?: string;
  pagemap?: GooglePageMap;
  [key: string]: unknown;
}

interface GoogleSearchError {
  error?: {
    code?: number;
    message?: string;
    status?: string;
  };
}

interface GoogleSearchResponse extends GoogleSearchError {
  items?: GoogleSearchItem[];
}

const timestampKeys = new Set([
  "article:published_time",
  "article:modified_time",
  "og:published_time",
  "og:updated_time",
  "pubdate",
  "publishdate",
  "last-modified",
  "dc.date",
  "dc.date.issued",
  "dc.date.created",
  "dc.date.modified",
  "date",
  "datemodified",
  "datepublished",
  "news_publish_date",
  "timestamp",
]);

const parseDateValue = (value: string | undefined): number | undefined => {
  if (!value) {
    return undefined;
  }
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? undefined : timestamp;
};

const extractStructuredDates = (entries: GoogleStructuredDataEntry[] | undefined): string[] => {
  if (!entries) {
    return [];
  }
  const candidates: string[] = [];
  const validKeys = new Set(["datepublished", "datemodified", "datecreated", "uploaddate"]);

  for (const entry of entries) {
    if (!entry) {
      continue;
    }
    for (const [rawKey, value] of Object.entries(entry)) {
      if (typeof value !== "string") {
        continue;
      }
      const key = rawKey.toLowerCase();
      if (validKeys.has(key)) {
        candidates.push(value);
      }
    }
  }
  return candidates;
};

const extractTimestamp = (item: GoogleSearchItem): number | undefined => {
  const candidates: string[] = [];

  const metatags = item.pagemap?.metatags ?? [];
  for (const tag of metatags) {
    if (!tag) {
      continue;
    }
    for (const [key, value] of Object.entries(tag)) {
      if (!value) {
        continue;
      }
      const normalizedKey = key.toLowerCase();
      if (timestampKeys.has(normalizedKey)) {
        candidates.push(value);
      }
    }
  }

  const structuredKeys = [
    item.pagemap?.newsarticle,
    item.pagemap?.blogposting,
    item.pagemap?.article,
    item.pagemap?.videoobject,
  ];

  for (const entry of structuredKeys) {
    candidates.push(...extractStructuredDates(entry));
  }

  for (const candidate of candidates) {
    const parsed = parseDateValue(candidate);
    if (typeof parsed === "number") {
      return parsed;
    }
  }

  return undefined;
};

const createMetadata = (item: GoogleSearchItem): Record<string, unknown> | undefined => {
  const metadata: Record<string, unknown> = {};

  if (item.displayLink) {
    metadata.displayLink = item.displayLink;
  }
  if (item.formattedUrl) {
    metadata.formattedUrl = item.formattedUrl;
  }
  if (item.cacheId) {
    metadata.cacheId = item.cacheId;
  }
  if (item.mime) {
    metadata.mime = item.mime;
  }
  if (item.fileFormat) {
    metadata.fileFormat = item.fileFormat;
  }

  return Object.keys(metadata).length > 0 ? metadata : undefined;
};

const normalizeResult = (item: GoogleSearchItem, index: number): SearchResult | undefined => {
  if (!item.title || !item.link) {
    return undefined;
  }

  const timestamp = extractTimestamp(item);
  const metadata = createMetadata(item);

  return {
    id: item.cacheId ? `google-${item.cacheId}` : `google-${index}`,
    title: item.title,
    description: item.snippet ?? "",
    url: item.link,
    timestamp,
    metadata,
  };
};

const createErrorMessage = async (response: Response): Promise<string> => {
  const contentType = response.headers.get("content-type") ?? "";
  try {
    if (contentType.includes("application/json")) {
      const data = (await response.json()) as GoogleSearchError;
      return data.error?.message || JSON.stringify(data.error ?? data) || response.statusText;
    }
    const text = await response.text();
    return text || response.statusText;
  } catch (error) {
    const fallbackText = await response.text().catch(() => "");
    const errorMessage = error instanceof Error ? error.message : String(error);
    return fallbackText || errorMessage || response.statusText;
  }
};

const googleSearch = async ({ query, limit, signal }: SearchQuery): Promise<SearchResult[]> => {
  if (signal.aborted) {
    return [];
  }

  const apiKey = Bun.env[API_KEY_ENV];
  if (!apiKey) {
    throw new Error(`Missing Google API key. Set ${API_KEY_ENV}=... to enable the plugin.`);
  }

  const cx = Bun.env[CX_ENV];
  if (!cx) {
    throw new Error(`Missing Google Custom Search engine id. Set ${CX_ENV}=... to enable the plugin.`);
  }

  const desiredLimit = Math.max(1, Math.min(limit ?? DEFAULT_RESULT_LIMIT, 10));

  const url = new URL(GOOGLE_ENDPOINT);
  url.searchParams.set("key", apiKey);
  url.searchParams.set("cx", cx);
  url.searchParams.set("q", query);
  url.searchParams.set("num", desiredLimit.toString());
  url.searchParams.set("safe", "active");

  try {
    const response = await fetch(url, {
      signal,
      headers: {
        accept: "application/json",
      },
    });

    if (!response.ok) {
      const errorMessage = await createErrorMessage(response);
      throw new Error(`Google request failed (${response.status}): ${errorMessage}`);
    }

    const data = (await response.json()) as GoogleSearchResponse;
    const items = data.items ?? [];

    return items
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

const googlePlugin: SearchPlugin = {
  id: "google",
  displayName: "Google",
  description: "Queries Google Custom Search (requires GOOGLE_API_KEY and GOOGLE_CX).",
  isEnabledByDefault: false,
  search: googleSearch,
};

export default googlePlugin;
