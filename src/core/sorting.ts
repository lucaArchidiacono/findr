import type { SearchResult } from "./backend";

export type SortOrder = "relevance" | "recency" | "source";

const scoreFallback = (result: SearchResult) => {
  if (typeof result.score === "number") {
    return result.score;
  }
  return 0;
};

const timestampFallback = (result: SearchResult) => {
  if (typeof result.timestamp === "number") {
    return result.timestamp;
  }
  return result.receivedAt;
};

export const sortResults = (results: SearchResult[], order: SortOrder): SearchResult[] => {
  switch (order) {
    case "recency":
      return [...results].sort(
        (a, b) =>
          timestampFallback(b) - timestampFallback(a) || scoreFallback(b) - scoreFallback(a),
      );
    case "source":
      return [...results].sort((a, b) => {
        const pluginCountDiff = b.pluginIds.length - a.pluginIds.length;
        if (pluginCountDiff !== 0) {
          return pluginCountDiff;
        }
        const byPluginIds = a.pluginIds.join(", ").localeCompare(b.pluginIds.join(", "));
        if (byPluginIds !== 0) {
          return byPluginIds;
        }
        return scoreFallback(b) - scoreFallback(a);
      });
    case "relevance":
    default:
      return [...results].sort((a, b) => {
        const byScore = scoreFallback(b) - scoreFallback(a);
        if (byScore !== 0) {
          return byScore;
        }
        return timestampFallback(b) - timestampFallback(a);
      });
  }
};
