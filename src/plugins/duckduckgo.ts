import type { PluginDef, PluginResult } from "../core/findr";

interface DDGTopic {
  Text?: string;
  FirstURL?: string;
}

interface DDGTopicGroup {
  Name?: string;
  Topics?: DDGTopic[];
}

export type DDGRelatedTopic = DDGTopic | DDGTopicGroup;

export interface DDGResponse {
  Abstract?: string;
  AbstractURL?: string;
  AbstractSource?: string;
  RelatedTopics?: DDGRelatedTopic[];
}

function flattenTopics(topics: DDGRelatedTopic[]): DDGTopic[] {
  const flat: DDGTopic[] = [];
  for (const entry of topics) {
    if ("Topics" in entry && Array.isArray(entry.Topics)) {
      flat.push(...entry.Topics);
    } else {
      flat.push(entry as DDGTopic);
    }
  }
  return flat;
}

export function parseDDGResults(data: DDGResponse): PluginResult[] {
  const results: PluginResult[] = [];

  if (data.Abstract && data.AbstractURL) {
    results.push({
      title: data.AbstractSource ?? "DuckDuckGo",
      description: data.Abstract,
      url: data.AbstractURL,
      score: 1,
    });
  }

  const topics = flattenTopics(data.RelatedTopics ?? []);
  for (const topic of topics) {
    if (results.length >= 10) break;
    if (topic.Text && topic.FirstURL) {
      results.push({
        title: topic.Text.slice(0, 80),
        description: topic.Text,
        url: topic.FirstURL,
        score: 0.5,
      });
    }
  }

  return results;
}

const duckduckgoPlugin: PluginDef = {
  name: "duckduckgo",
  displayName: "DuckDuckGo",
  description: "Search DuckDuckGo instant answers (no API key required). Best for entities and topics.",
  enabled: false,
  search: async (query, signal) => {
    if (signal.aborted) return [];

    const url = new URL("https://api.duckduckgo.com/");
    url.searchParams.set("q", query);
    url.searchParams.set("format", "json");
    url.searchParams.set("no_html", "1");

    const response = await fetch(url, {
      signal,
      headers: { "User-Agent": "Findr/1.0" },
    });

    if (!response.ok) {
      throw new Error(`DuckDuckGo request failed: ${response.status}`);
    }

    const data = (await response.json()) as DDGResponse;
    return parseDDGResults(data);
  },
};

export default duckduckgoPlugin;
