import { afterEach, describe, expect, it, vi } from "vitest";
import jiraPlugin from "./jira";

const BASE_URL = "https://example.atlassian.net";
const EMAIL = "user@example.com";
const TOKEN = "secret-token";

const setEnv = () => {
  process.env.JIRA_BASE_URL = BASE_URL;
  process.env.JIRA_EMAIL = EMAIL;
  process.env.JIRA_API_TOKEN = TOKEN;
};

const clearEnv = () => {
  delete process.env.JIRA_BASE_URL;
  delete process.env.JIRA_EMAIL;
  delete process.env.JIRA_API_TOKEN;
};

afterEach(() => {
  vi.restoreAllMocks();
  clearEnv();
});

describe("jiraPlugin", () => {
  it("throws when required environment variables are missing", async () => {
    const abortController = new AbortController();

    await expect(
      jiraPlugin.search({
        query: "test query",
        limit: 5,
        signal: abortController.signal,
      }),
    ).rejects.toThrow(/Missing Jira credentials/);
  });

  it("returns normalized results from the Jira API", async () => {
    setEnv();

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        issues: [
          {
            id: "1001",
            key: "ENG-42",
            fields: {
              summary: "Fix login regression",
              description: {
                type: "doc",
                content: [
                  {
                    type: "paragraph",
                    content: [
                      {
                        type: "text",
                        text: "Users cannot log in when MFA is enabled.",
                      },
                    ],
                  },
                ],
              },
              updated: "2024-05-05T12:34:56.000Z",
              status: {
                name: "In Progress",
              },
            },
          },
        ],
      }),
    });

    vi.stubGlobal("fetch", fetchMock);

    const abortController = new AbortController();

    const results = await jiraPlugin.search({
      query: "login issue",
      limit: 3,
      signal: abortController.signal,
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [requestUrl] = fetchMock.mock.calls[0];
    expect(String(requestUrl)).toContain("/rest/api/3/search");

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      id: "1001",
      title: "ENG-42 - Fix login regression",
      description: "Status: In Progress | Users cannot log in when MFA is enabled.",
      url: "https://example.atlassian.net/browse/ENG-42",
      metadata: {
        key: "ENG-42",
        status: "In Progress",
      },
    });

    expect(results[0]?.timestamp).toBeTypeOf("number");
  });

  it("propagates schema validation errors", async () => {
    setEnv();

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        issues: [
          {
            key: 123,
            fields: {
              summary: null,
            },
          },
        ],
      }),
    });

    vi.stubGlobal("fetch", fetchMock);

    const abortController = new AbortController();

    await expect(
      jiraPlugin.search({
        query: "bad data",
        signal: abortController.signal,
      }),
    ).rejects.toThrowError();
  });
});
