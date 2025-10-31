import { z } from "zod";
import type { SearchPlugin, SearchQuery, SearchResult } from "../core/plugins";

const BASE_URL_ENV = "JIRA_BASE_URL";
const EMAIL_ENV = "JIRA_EMAIL";
const TOKEN_ENV = "JIRA_API_TOKEN";

const DEFAULT_RESULT_LIMIT = 10;
const MAX_RESULT_LIMIT = 50;

type AdfNode = {
  type?: string;
  text?: string;
  content?: AdfNode[];
  [key: string]: unknown;
};

const AdfNodeSchema: z.ZodType<AdfNode> = z.lazy(() =>
  z
    .object({
      type: z.string().optional(),
      text: z.string().optional(),
      content: z.array(AdfNodeSchema).optional(),
    })
    .passthrough(),
);

const JiraDescriptionSchema = z.union([AdfNodeSchema, z.string()]).nullish();

const JiraIssueSchema = z.object({
  id: z.string().optional(),
  key: z.string().min(1),
  self: z.string().url().optional(),
  fields: z.object({
    summary: z.string().min(1),
    description: JiraDescriptionSchema.optional(),
    updated: z.string().optional(),
    status: z
      .object({
        name: z.string().optional(),
      })
      .optional(),
  }),
});

const JiraSearchResponseSchema = z.object({
  issues: z.array(JiraIssueSchema),
  total: z.number().optional(),
});

type JiraIssue = z.infer<typeof JiraIssueSchema>;
type JiraDescription = z.infer<typeof JiraDescriptionSchema>;

const sanitizeBaseUrl = (value: string): string => value.replace(/\/$/, "");

const readEnv = (name: string): string | undefined => {
  if (typeof Bun !== "undefined" && Bun.env) {
    return Bun.env[name];
  }
  if (typeof process !== "undefined" && process.env) {
    return process.env[name];
  }
  return undefined;
};

const encodeBasicAuth = (email: string, token: string): string => {
  const credentials = `${email}:${token}`;
  return `Basic ${Buffer.from(credentials).toString("base64")}`;
};

const escapeQueryForJql = (query: string): string =>
  query.replace(/\\/g, "\\\\").replace(/"/g, '\\"');

const buildJql = (query: string): string =>
  `text ~ "${escapeQueryForJql(query)}" ORDER BY updated DESC`;

const parseTimestamp = (value: string | undefined): number | undefined => {
  if (!value) return undefined;
  const ts = Date.parse(value);
  return Number.isNaN(ts) ? undefined : ts;
};

const extractAdfText = (node: JiraDescription): string => {
  if (!node) {
    return "";
  }

  if (typeof node === "string") {
    return node;
  }

  if (typeof node.text === "string") {
    return node.text;
  }

  if (Array.isArray(node.content)) {
    return node.content.map((child) => extractAdfText(child)).filter(Boolean).join(" ");
  }

  return "";
};

const formatDescription = (issue: JiraIssue): string => {
  const description = extractAdfText(issue.fields.description);
  const status = issue.fields.status?.name ? `Status: ${issue.fields.status.name}` : undefined;

  return [status, description]
    .map((value) => value?.replace(/\s+/g, " ").trim())
    .filter((value): value is string => Boolean(value && value.length > 0))
    .join(" | ");
};

const normalizeIssue = (issue: JiraIssue, baseUrl: string, index: number): SearchResult => {
  const description = formatDescription(issue);
  const url = `${sanitizeBaseUrl(baseUrl)}/browse/${issue.key}`;

  return {
    id: issue.id ?? `jira-${index}-${issue.key}`,
    title: `${issue.key} - ${issue.fields.summary}`,
    description,
    url,
    timestamp: parseTimestamp(issue.fields.updated),
    metadata: {
      key: issue.key,
      ...(issue.fields.status?.name ? { status: issue.fields.status.name } : {}),
    },
  };
};

const jiraSearch = async ({ query, limit, signal }: SearchQuery): Promise<SearchResult[]> => {
  if (signal.aborted) {
    return [];
  }

  const baseUrl = readEnv(BASE_URL_ENV);
  const email = readEnv(EMAIL_ENV);
  const token = readEnv(TOKEN_ENV);

  if (!baseUrl || !email || !token) {
    throw new Error(
      `Missing Jira credentials. Set ${BASE_URL_ENV}, ${EMAIL_ENV}, and ${TOKEN_ENV} environment variables.`,
    );
  }

  const desiredLimit = Math.max(1, Math.min(limit ?? DEFAULT_RESULT_LIMIT, MAX_RESULT_LIMIT));

  const url = new URL("/rest/api/3/search", sanitizeBaseUrl(baseUrl));
  url.searchParams.set("jql", buildJql(query));
  url.searchParams.set("maxResults", desiredLimit.toString());
  url.searchParams.set("fields", "summary,description,updated,status");

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        accept: "application/json",
        authorization: encodeBasicAuth(email, token),
      },
      signal,
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Jira request failed (${response.status}): ${errorBody || response.statusText}`);
    }

    const payload = JiraSearchResponseSchema.parse(await response.json());
    return payload.issues.slice(0, desiredLimit).map((issue, index) => normalizeIssue(issue, baseUrl, index));
  } catch (error) {
    if (signal.aborted) {
      return [];
    }
    throw error instanceof Error ? error : new Error(String(error));
  }
};

const jiraPlugin: SearchPlugin = {
  id: "jira",
  displayName: "Jira",
  description: "Searches Atlassian Jira issues (requires JIRA_BASE_URL, JIRA_EMAIL, JIRA_API_TOKEN).",
  isEnabledByDefault: false,
  search: jiraSearch,
};

export default jiraPlugin;
