import { afterEach, describe, expect, it, vi } from "vitest";
import kagiPlugin from "./kagi";

const KAGI_ENDPOINT = "https://kagi.com/api/v0/search";

const originalApiKey = process.env.KAGI_API_KEY;

afterEach(() => {
  vi.restoreAllMocks();

  if (originalApiKey === undefined) {
    delete process.env.KAGI_API_KEY;
  } else {
    process.env.KAGI_API_KEY = originalApiKey;
  }
});

describe("kagi plugin", () => {
  it("throws when API key is missing", async () => {
    delete process.env.KAGI_API_KEY;

    const abortController = new AbortController();

    await expect(
      kagiPlugin.search({ query: "test", limit: 3, signal: abortController.signal }),
    ).rejects.toThrow(/Missing Kagi API key/);
  });

  it("normalizes search results from the API", async () => {
    process.env.KAGI_API_KEY = "test-key";

    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          results: [
            {
              id: "abc",
              title: "Example Result",
              url: "https://example.com",
              snippet: "A useful snippet",
              score: 0.92,
              published_date: "2025-01-30T12:00:00Z",
              displayed_url: "example.com",
              language: "en",
              source: "Kagi",
            },
            {
              title: "",
              url: "",
            },
          ],
        },
      }),
      text: async () => "",
    } as unknown as Response);

    const abortController = new AbortController();
    const results = await kagiPlugin.search({
      query: "example",
      limit: 5,
      signal: abortController.signal,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(KAGI_ENDPOINT);
    expect(init?.method).toBe("POST");
    expect(init?.headers).toMatchObject({
      accept: "application/json",
      "content-type": "application/json",
      Authorization: "Bot test-key",
    });
    expect(init?.body).toBe(JSON.stringify({ query: "example", limit: 5 }));

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      id: "abc",
      title: "Example Result",
      description: "A useful snippet",
      url: "https://example.com",
      score: 0.92,
    });
    expect(results[0].metadata).toMatchObject({
      displayedUrl: "example.com",
      language: "en",
      source: "Kagi",
    });
    if (results[0].timestamp !== undefined) {
      expect(typeof results[0].timestamp).toBe("number");
    }
  });

  it("returns an empty result set when aborted during a failure", async () => {
    process.env.KAGI_API_KEY = "test-key";

    const abortController = new AbortController();

    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      abortController.abort();
      throw new Error("network down");
    });

    const results = await kagiPlugin.search({
      query: "failure",
      limit: 2,
      signal: abortController.signal,
    });

    expect(results).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
