import { describe, expect, it, spyOn } from "bun:test";
import duckduckgoPlugin, { parseDDGHTML } from "./duckduckgo";

const signal = () => new AbortController().signal;

const sampleHTML = `
<div class="result results_links results_links_deep web-result">
  <div class="result__body links_main links_deep">
    <h2 class="result__title">
      <a rel="nofollow" class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Freact.dev%2Freference%2Freact%2Fhooks&rut=abc123">
        React Hooks Reference
      </a>
    </h2>
    <a class="result__snippet" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Freact.dev%2Freference%2Freact%2Fhooks&rut=abc123">
      Hooks let you use state and other React features from function components.
    </a>
  </div>
</div>
<div class="result results_links results_links_deep web-result">
  <div class="result__body links_main links_deep">
    <h2 class="result__title">
      <a rel="nofollow" class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fhooks-guide&rut=def456">
        Complete Guide to <b>React Hooks</b>
      </a>
    </h2>
    <a class="result__snippet" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fhooks-guide&rut=def456">
      Learn how to use useState, useEffect, and custom hooks in your apps.
    </a>
  </div>
</div>
`;

describe("parseDDGHTML", () => {
  it("parses result titles, URLs, and descriptions", () => {
    const results = parseDDGHTML(sampleHTML);
    expect(results).toHaveLength(2);
    expect(results[0]!.title).toBe("React Hooks Reference");
    expect(results[0]!.url).toBe("https://react.dev/reference/react/hooks");
    expect(results[0]!.description).toBe(
      "Hooks let you use state and other React features from function components.",
    );
  });

  it("strips HTML tags from titles", () => {
    const results = parseDDGHTML(sampleHTML);
    expect(results[1]!.title).toBe("Complete Guide to React Hooks");
  });

  it("decodes redirect URLs", () => {
    const results = parseDDGHTML(sampleHTML);
    expect(results[1]!.url).toBe("https://example.com/hooks-guide");
  });

  it("handles empty HTML", () => {
    expect(parseDDGHTML("")).toEqual([]);
    expect(parseDDGHTML("<html><body></body></html>")).toEqual([]);
  });

  it("caps at 10 results", () => {
    const manyResults = Array.from(
      { length: 15 },
      (_, i) => `
      <a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fex.com%2F${i}&rut=x">Title ${i}</a>
      <a class="result__snippet">Desc ${i}</a>
    `,
    ).join("\n");

    const results = parseDDGHTML(manyResults);
    expect(results).toHaveLength(10);
  });

  it("handles results without snippets", () => {
    const html = `<a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fex.com&rut=x">Title</a>`;
    const results = parseDDGHTML(html);
    expect(results).toHaveLength(1);
    expect(results[0]!.description).toBe("");
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

  it("fetches and parses HTML results", async () => {
    const fetchSpy = spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(sampleHTML, { status: 200 }),
    );

    try {
      const results = await duckduckgoPlugin.search("react hooks", signal());
      expect(results).toHaveLength(2);
      expect(results[0]!.title).toBe("React Hooks Reference");
      expect(results[0]!.url).toBe("https://react.dev/reference/react/hooks");
      expect(results[0]!.score).toBe(10);
      expect(results[1]!.score).toBe(9);

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const [url, options] = fetchSpy.mock.calls[0]!;
      expect(url).toBe("https://html.duckduckgo.com/html/");
      expect((options as RequestInit).method).toBe("POST");
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
