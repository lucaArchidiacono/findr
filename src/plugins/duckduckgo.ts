import type { PluginDef, PluginResult } from "../core/findr";

export interface DDGHTMLResult {
  title: string;
  url: string;
  description: string;
}

export function parseDDGHTML(html: string): DDGHTMLResult[] {
  const results: DDGHTMLResult[] = [];

  // Each web result is inside a <a class="result__a" ...> for the title/URL
  // and <a class="result__snippet" ...> for the description.
  // We match each result block between "result__body" markers.
  const linkPattern =
    /<a[^>]+class="result__a"[^>]+href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g;
  const snippetPattern = /<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;

  const links: { url: string; title: string }[] = [];
  let match: RegExpExecArray | null;

  while ((match = linkPattern.exec(html)) !== null) {
    const url = decodeURIComponent(
      (match[1] ?? "").replace(/^\/\/duckduckgo\.com\/l\/\?uddg=/, "").replace(/&rut=.*$/, ""),
    );
    const title = (match[2] ?? "").replace(/<[^>]*>/g, "").trim();
    if (url && title) {
      links.push({ url, title });
    }
  }

  const snippets: string[] = [];
  while ((match = snippetPattern.exec(html)) !== null) {
    snippets.push((match[1] ?? "").replace(/<[^>]*>/g, "").trim());
  }

  for (let i = 0; i < links.length && results.length < 10; i++) {
    results.push({
      title: links[i]!.title,
      url: links[i]!.url,
      description: snippets[i] ?? "",
    });
  }

  return results;
}

const duckduckgoPlugin: PluginDef = {
  name: "duckduckgo",
  displayName: "DuckDuckGo",
  description: "Search DuckDuckGo web results (no API key required).",
  enabled: false,
  search: async (query, signal) => {
    if (signal.aborted) return [];

    const response = await fetch("https://html.duckduckgo.com/html/", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "Findr/1.0",
      },
      body: new URLSearchParams({ q: query }),
      signal,
    });

    if (!response.ok) {
      throw new Error(`DuckDuckGo request failed: ${response.status}`);
    }

    const html = await response.text();
    const parsed = parseDDGHTML(html);

    return parsed.map<PluginResult>((item, idx) => ({
      title: item.title,
      description: item.description,
      url: item.url,
      score: 10 - idx,
    }));
  },
};

export default duckduckgoPlugin;
