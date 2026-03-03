import { describe, expect, it, spyOn } from "bun:test";
import duckduckgoPlugin, { parseDDGResults, type DDGResponse } from "./duckduckgo";

const signal = () => new AbortController().signal;

describe("parseDDGResults", () => {
  it("parses abstract into a result", () => {
    const data: DDGResponse = {
      Abstract: "Bun is a JavaScript runtime",
      AbstractURL: "https://bun.sh",
      AbstractSource: "Bun",
    };

    const results = parseDDGResults(data);
    expect(results).toHaveLength(1);
    expect(results[0]!.title).toBe("Bun");
    expect(results[0]!.description).toBe("Bun is a JavaScript runtime");
    expect(results[0]!.url).toBe("https://bun.sh");
    expect(results[0]!.score).toBe(1);
  });

  it("defaults abstract title to DuckDuckGo", () => {
    const data: DDGResponse = {
      Abstract: "Something",
      AbstractURL: "https://example.com",
    };

    const results = parseDDGResults(data);
    expect(results[0]!.title).toBe("DuckDuckGo");
  });

  it("parses flat related topics", () => {
    const data: DDGResponse = {
      RelatedTopics: [
        { Text: "Topic one with details", FirstURL: "https://one.com" },
        { Text: "Topic two with details", FirstURL: "https://two.com" },
      ],
    };

    const results = parseDDGResults(data);
    expect(results).toHaveLength(2);
    expect(results[0]!.score).toBe(0.5);
    expect(results[1]!.url).toBe("https://two.com");
  });

  it("flattens nested topic groups", () => {
    const data: DDGResponse = {
      RelatedTopics: [
        {
          Name: "Libraries",
          Topics: [
            { Text: "NumPy is a library", FirstURL: "https://numpy.com" },
            { Text: "SciPy is a library", FirstURL: "https://scipy.com" },
          ],
        },
        { Text: "Flat topic", FirstURL: "https://flat.com" },
      ],
    };

    const results = parseDDGResults(data);
    expect(results).toHaveLength(3);
    expect(results[0]!.url).toBe("https://numpy.com");
    expect(results[1]!.url).toBe("https://scipy.com");
    expect(results[2]!.url).toBe("https://flat.com");
  });

  it("skips topics without text or url", () => {
    const data: DDGResponse = {
      RelatedTopics: [
        { Text: "Valid", FirstURL: "https://valid.com" },
        { Text: "No URL" },
        { FirstURL: "https://no-text.com" },
        {},
      ],
    };

    const results = parseDDGResults(data);
    expect(results).toHaveLength(1);
  });

  it("combines abstract and related topics", () => {
    const data: DDGResponse = {
      Abstract: "Main abstract",
      AbstractURL: "https://main.com",
      AbstractSource: "Main",
      RelatedTopics: [{ Text: "Related one", FirstURL: "https://related.com" }],
    };

    const results = parseDDGResults(data);
    expect(results).toHaveLength(2);
    expect(results[0]!.score).toBe(1);
    expect(results[1]!.score).toBe(0.5);
  });

  it("caps at 10 results", () => {
    const data: DDGResponse = {
      Abstract: "Main",
      AbstractURL: "https://main.com",
      RelatedTopics: Array.from({ length: 20 }, (_, i) => ({
        Text: `Topic ${i}`,
        FirstURL: `https://t${i}.com`,
      })),
    };

    const results = parseDDGResults(data);
    expect(results.length).toBeLessThanOrEqual(10);
  });

  it("caps at 10 including nested groups", () => {
    const data: DDGResponse = {
      RelatedTopics: [
        {
          Name: "Group",
          Topics: Array.from({ length: 15 }, (_, i) => ({
            Text: `Nested ${i}`,
            FirstURL: `https://n${i}.com`,
          })),
        },
      ],
    };

    const results = parseDDGResults(data);
    expect(results).toHaveLength(10);
  });

  it("handles empty response", () => {
    expect(parseDDGResults({})).toEqual([]);
  });

  it("truncates topic title to 80 chars", () => {
    const longText = "A".repeat(200);
    const data: DDGResponse = {
      RelatedTopics: [{ Text: longText, FirstURL: "https://long.com" }],
    };

    const results = parseDDGResults(data);
    expect(results[0]!.title).toHaveLength(80);
    expect(results[0]!.description).toBe(longText);
  });
});

describe("duckduckgo plugin", () => {
  it("has correct metadata", () => {
    expect(duckduckgoPlugin.name).toBe("duckduckgo");
    expect(duckduckgoPlugin.displayName).toBe("DuckDuckGo");
    expect(duckduckgoPlugin.enabled).toBe(false);
  });

  it("returns empty when signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    const results = await duckduckgoPlugin.search("test", controller.signal);
    expect(results).toHaveLength(0);
  });

  it("fetches and parses results including nested groups", async () => {
    const mockData: DDGResponse = {
      Abstract: "Test abstract",
      AbstractURL: "https://test.com",
      AbstractSource: "Test Source",
      RelatedTopics: [
        { Text: "Flat topic", FirstURL: "https://flat.com" },
        {
          Name: "Related",
          Topics: [{ Text: "Nested topic", FirstURL: "https://nested.com" }],
        },
      ],
    };

    const fetchSpy = spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(mockData), { status: 200 }),
    );

    try {
      const results = await duckduckgoPlugin.search("test query", signal());
      expect(results).toHaveLength(3);
      expect(results[0]!.title).toBe("Test Source");
      expect(results[1]!.url).toBe("https://flat.com");
      expect(results[2]!.url).toBe("https://nested.com");

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const calledUrl = fetchSpy.mock.calls[0]![0] as URL;
      expect(calledUrl.searchParams.get("q")).toBe("test query");
      expect(calledUrl.searchParams.get("format")).toBe("json");
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it("throws on non-200 response", async () => {
    const fetchSpy = spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("error", { status: 500 }),
    );

    try {
      await expect(duckduckgoPlugin.search("test", signal())).rejects.toThrow(
        "DuckDuckGo request failed: 500",
      );
    } finally {
      fetchSpy.mockRestore();
    }
  });
});
