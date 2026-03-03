import { describe, expect, it, beforeEach, afterEach, spyOn } from "bun:test";
import bravePlugin, { parseBraveResults, type BraveSearchResponse } from "./brave";

const signal = () => new AbortController().signal;

describe("parseBraveResults", () => {
  it("parses a standard response", () => {
    const data: BraveSearchResponse = {
      web: {
        results: [
          {
            title: "Example",
            url: "https://example.com",
            description: "An example page",
            rank: 5,
          },
          {
            title: "Another",
            url: "https://another.com",
            description: "Another page",
          },
        ],
      },
    };

    const results = parseBraveResults(data);
    expect(results).toHaveLength(2);
    expect(results[0]!.title).toBe("Example");
    expect(results[0]!.url).toBe("https://example.com");
    expect(results[0]!.score).toBe(5);
    expect(results[1]!.score).toBeUndefined();
  });

  it("skips results without title or url", () => {
    const data: BraveSearchResponse = {
      web: {
        results: [
          { title: "Good", url: "https://good.com" },
          { title: "No URL" },
          { url: "https://no-title.com" },
          {},
        ],
      },
    };

    const results = parseBraveResults(data);
    expect(results).toHaveLength(1);
    expect(results[0]!.title).toBe("Good");
  });

  it("parses timestamps from page_age", () => {
    const data: BraveSearchResponse = {
      web: {
        results: [
          {
            title: "Dated",
            url: "https://dated.com",
            page_age: "2024-06-15T00:00:00Z",
          },
        ],
      },
    };

    const results = parseBraveResults(data);
    expect(results[0]!.timestamp).toBe(Date.parse("2024-06-15T00:00:00Z"));
  });

  it("falls back to meta_url timestamps", () => {
    const data: BraveSearchResponse = {
      web: {
        results: [
          {
            title: "Meta",
            url: "https://meta.com",
            meta_url: { published: "2024-01-01T00:00:00Z" },
          },
        ],
      },
    };

    const results = parseBraveResults(data);
    expect(results[0]!.timestamp).toBe(Date.parse("2024-01-01T00:00:00Z"));
  });

  it("handles empty response", () => {
    expect(parseBraveResults({})).toEqual([]);
    expect(parseBraveResults({ web: {} })).toEqual([]);
    expect(parseBraveResults({ web: { results: [] } })).toEqual([]);
  });
});

describe("brave plugin", () => {
  it("has correct metadata", () => {
    expect(bravePlugin.name).toBe("brave");
    expect(bravePlugin.displayName).toBe("Brave");
    expect(bravePlugin.enabled).toBe(false);
  });

  it("throws when BRAVE_API_KEY is missing", async () => {
    const original = Bun.env["BRAVE_API_KEY"];
    delete Bun.env["BRAVE_API_KEY"];
    try {
      await expect(bravePlugin.search("test", signal())).rejects.toThrow("Missing Brave API key");
    } finally {
      if (original) Bun.env["BRAVE_API_KEY"] = original;
    }
  });

  it("returns empty when signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    const results = await bravePlugin.search("test", controller.signal);
    expect(results).toHaveLength(0);
  });

  it("fetches and parses results with API key set", async () => {
    const original = Bun.env["BRAVE_API_KEY"];
    Bun.env["BRAVE_API_KEY"] = "test-key";

    const mockResponse: BraveSearchResponse = {
      web: {
        results: [
          { title: "Result 1", url: "https://r1.com", description: "First" },
          { title: "Result 2", url: "https://r2.com", description: "Second", rank: 3 },
        ],
      },
    };

    const fetchSpy = spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(mockResponse), { status: 200 }),
    );

    try {
      const results = await bravePlugin.search("hello", signal());
      expect(results).toHaveLength(2);
      expect(results[0]!.title).toBe("Result 1");
      expect(results[1]!.score).toBe(3);

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const calledUrl = fetchSpy.mock.calls[0]![0] as URL;
      expect(calledUrl.searchParams.get("q")).toBe("hello");
    } finally {
      fetchSpy.mockRestore();
      if (original) Bun.env["BRAVE_API_KEY"] = original;
      else delete Bun.env["BRAVE_API_KEY"];
    }
  });

  it("throws on non-200 response", async () => {
    const original = Bun.env["BRAVE_API_KEY"];
    Bun.env["BRAVE_API_KEY"] = "test-key";

    const fetchSpy = spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("rate limited", { status: 429 }),
    );

    try {
      await expect(bravePlugin.search("test", signal())).rejects.toThrow("Brave request failed (429)");
    } finally {
      fetchSpy.mockRestore();
      if (original) Bun.env["BRAVE_API_KEY"] = original;
      else delete Bun.env["BRAVE_API_KEY"];
    }
  });
});
