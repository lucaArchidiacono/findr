import { z } from "zod";
import type { SearchPlugin, SearchQuery, SearchResult } from "../core/plugins";

const BASE_URL_ENV = "CONFLUENCE_BASE_URL";
const EMAIL_ENV = "CONFLUENCE_EMAIL";
const TOKEN_ENV = "CONFLUENCE_API_TOKEN";
const DEFAULT_RESULT_LIMIT = 10;
const MAX_RESULT_LIMIT = 50;

const LinksSchema = z
  .object({
    webui: z.string().optional(),
    base: z.string().optional(),
    tinyui: z.string().optional(),
    self: z.string().optional(),
  })
  .catchall(z.unknown());

const VersionSchema = z
  .object({
    when: z.string().optional(),
  })
  .catchall(z.unknown());

const ResultGlobalContainerSchema = z
  .object({
    title: z.string().optional(),
    displayName: z.string().optional(),
    type: z.string().optional(),
    id: z.string().optional(),
  })
  .catchall(z.unknown());

const ContentSchema = z
  .object({
    id: z.string().optional(),
    type: z.string().optional(),
    status: z.string().optional(),
    title: z.string().optional(),
    version: VersionSchema.optional(),
    _links: LinksSchema.optional(),
    spaceId: z.string().optional(),
  })
  .catchall(z.unknown());

const ConfluenceResultSchema = z
  .object({
    id: z.string().optional(),
    title: z.string().optional(),
    url: z.string().optional(),
    excerpt: z.string().optional(),
    content: ContentSchema.optional(),
    resultGlobalContainer: ResultGlobalContainerSchema.optional(),
    _links: LinksSchema.optional(),
  })
  .catchall(z.unknown());

const ConfluenceSearchResponseSchema = z
  .object({
    results: z.array(ConfluenceResultSchema).default([]),
  })
  .catchall(z.unknown());

const stripHtml = (value: string | undefined): string => {
  if (!value) {
    return "";
  }
  return value
    .replace(/<br\s*\/?>(\s|&nbsp;)?/gi, " ")
    .replace(/<\/?span[^>]*>/gi, " ")
    .replace(/<\/?em[^>]*>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
};

const parseTimestamp = (value: string | undefined): number | undefined => {
  if (!value) {
    return undefined;
  }
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? undefined : parsed;
};

const escapeCql = (value: string): string =>
  value
    .trim()
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\s+/g, " ");

const resolveUrl = (
  origin: string,
  contextPath: string,
  relativeOrAbsolute: string | undefined,
): string | undefined => {
  if (!relativeOrAbsolute) {
    return undefined;
  }

  try {
    const absolute = new URL(relativeOrAbsolute);
    if (absolute.protocol === "http:" || absolute.protocol === "https:") {
      return absolute.toString();
    }
  } catch {
    // Not an absolute URL, fall back to manual resolution.
  }

  const normalizedContext = contextPath === "/" ? "" : contextPath;
  const sanitized = relativeOrAbsolute.startsWith("/")
    ? relativeOrAbsolute
    : `/${relativeOrAbsolute}`;

  const candidate = sanitized.startsWith(normalizedContext) && normalizedContext
    ? sanitized
    : `${normalizedContext}${sanitized}`;

  return `${origin}${candidate}`.replace(/([^:]\/)(\/+)/g, "$1");
};

const createMetadata = (result: z.infer<typeof ConfluenceResultSchema>): Record<string, unknown> | undefined => {
  const metadataEntries: [string, unknown][] = [
    ["contentId", result.content?.id],
    ["contentType", result.content?.type],
    ["status", result.content?.status],
    ["containerTitle", result.resultGlobalContainer?.title ?? result.resultGlobalContainer?.displayName],
    ["containerType", result.resultGlobalContainer?.type],
    ["spaceId", result.content?.spaceId],
  ];

  const metadata = Object.fromEntries(metadataEntries.filter(([, value]) => value !== undefined));
  return Object.keys(metadata).length > 0 ? metadata : undefined;
};

const normalizeResult = (
  origin: string,
  contextPath: string,
  result: z.infer<typeof ConfluenceResultSchema>,
  index: number,
): SearchResult | undefined => {
  const title = result.title?.trim() || result.content?.title?.trim();

  const candidateUrl =
    result.url ||
    result._links?.webui ||
    result._links?.self ||
    result.content?._links?.webui ||
    result.content?._links?.self;

  const url = resolveUrl(origin, contextPath, candidateUrl);

  if (!title || !url) {
    return undefined;
  }

  const excerpt = stripHtml(result.excerpt);
  const timestamp = parseTimestamp(result.content?.version?.when);
  const metadata = createMetadata(result);

  return {
    id: `confluence-${result.content?.id ?? result.id ?? index}`,
    title,
    description: excerpt,
    url,
    timestamp,
    metadata,
  } satisfies SearchResult;
};

const getEnvironmentConfig = () => {
  const baseUrl = Bun.env[BASE_URL_ENV];
  const email = Bun.env[EMAIL_ENV];
  const token = Bun.env[TOKEN_ENV];

  if (!baseUrl) {
    throw new Error(`Missing Confluence base URL. Set ${BASE_URL_ENV}=... to enable the plugin.`);
  }

  if (!email) {
    throw new Error(`Missing Confluence account email. Set ${EMAIL_ENV}=... to enable the plugin.`);
  }

  if (!token) {
    throw new Error(`Missing Confluence API token. Set ${TOKEN_ENV}=... to enable the plugin.`);
  }

  try {
    const url = new URL(baseUrl);
    const normalizedPath = url.pathname.replace(/\/$/, "");
    const origin = url.origin;
    const contextPath = normalizedPath === "/" ? "" : normalizedPath;
    const apiBase = `${origin}${contextPath}`;
    return { origin, contextPath, apiBase, email, token };
  } catch (error) {
    throw new Error(`Invalid Confluence base URL provided in ${BASE_URL_ENV}.`);
  }
};

const buildAuthHeader = (email: string, token: string): string => {
  const payload = Buffer.from(`${email}:${token}`, "utf8").toString("base64");
  return `Basic ${payload}`;
};

const confluenceSearch = async ({ query, limit, signal }: SearchQuery): Promise<SearchResult[]> => {
  if (signal.aborted) {
    return [];
  }

  const { origin, contextPath, apiBase, email, token } = getEnvironmentConfig();

  const normalizedQuery = query.trim();
  if (!normalizedQuery) {
    return [];
  }

  const desiredLimit = Math.max(1, Math.min(limit ?? DEFAULT_RESULT_LIMIT, MAX_RESULT_LIMIT));
  const cql = `text ~ "${escapeCql(normalizedQuery)}"`;

  const endpoint = new URL(`${apiBase}/rest/api/search`);
  endpoint.searchParams.set("cql", cql);
  endpoint.searchParams.set("limit", desiredLimit.toString());
  endpoint.searchParams.set("expand", "content.version,content.metadata.currentuser");

  try {
    const response = await fetch(endpoint, {
      headers: {
        accept: "application/json",
        authorization: buildAuthHeader(email, token),
      },
      signal,
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(
        `Confluence request failed (${response.status}): ${errorBody || response.statusText}`,
      );
    }

    const json = await response.json();
    const parsed = ConfluenceSearchResponseSchema.safeParse(json);

    if (!parsed.success) {
      throw new Error(`Unexpected Confluence API response: ${parsed.error.message}`);
    }

    return parsed.data.results
      .map((result, index) => normalizeResult(origin, contextPath, result, index))
      .filter((item): item is SearchResult => Boolean(item))
      .slice(0, desiredLimit);
  } catch (error) {
    if (signal.aborted) {
      return [];
    }

    throw error instanceof Error ? error : new Error(String(error));
  }
};

const confluencePlugin: SearchPlugin = {
  id: "confluence",
  displayName: "Confluence",
  description:
    "Searches Atlassian Confluence spaces using the REST API (requires CONFLUENCE_* environment variables).",
  isEnabledByDefault: false,
  search: confluenceSearch,
};

export default confluencePlugin;
