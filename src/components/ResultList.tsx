import type { SearchResult } from "../core/backend";
import { truncate, truncateUrl } from "../utils/formatting";
import { BoxRenderable, ScrollBoxRenderable, TextAttributes } from "@opentui/core";
import { useEffect, useRef } from "react";

interface ResultListProps {
  results: SearchResult[];
  selectedIndex: number;
  isLoading: boolean;
}

const MAX_DESCRIPTION_LENGTH = 120;
const MAX_URL_LENGTH = 60;

export const ResultList = ({ results, selectedIndex, isLoading }: ResultListProps) => {
  const scrollRef = useRef<ScrollBoxRenderable | null>(null);
  const itemRefs = useRef<Map<string, BoxRenderable>>(new Map());

  useEffect(() => {
    const scrollbox = scrollRef.current;
    if (!scrollbox) {
      return;
    }
    const selected = results[selectedIndex];
    if (!selected) {
      return;
    }
    const target = itemRefs.current.get(selected.id);
    if (!target) {
      return;
    }
    const viewport = scrollbox.viewport;
    if (!viewport) {
      return;
    }
    const viewportHeight = viewport.height;
    if (viewportHeight <= 0) {
      return;
    }
    const currentScrollTop = scrollbox.scrollTop;
    const itemOffsetTop = target.y - viewport.y + currentScrollTop;
    const itemOffsetBottom = itemOffsetTop + target.height;
    const viewportBottom = currentScrollTop + viewportHeight;
    let nextScrollTop = currentScrollTop;
    if (itemOffsetTop < currentScrollTop) {
      nextScrollTop = itemOffsetTop;
    } else if (itemOffsetBottom > viewportBottom) {
      nextScrollTop = itemOffsetBottom - viewportHeight;
    }
    if (nextScrollTop !== currentScrollTop) {
      const maxScrollTop = Math.max(0, scrollbox.scrollHeight - viewportHeight);
      scrollbox.scrollTop = Math.min(Math.max(nextScrollTop, 0), maxScrollTop);
    }
  }, [results, selectedIndex]);

  if (isLoading) {
    return (
      <box
        flexGrow={1}
        justifyContent="center"
        alignItems="center"
        borderStyle="rounded"
        borderColor="#333333"
      >
        <text attributes={TextAttributes.DIM}>Searching…</text>
      </box>
    );
  }

  if (results.length === 0) {
    return (
      <box
        flexGrow={1}
        justifyContent="center"
        alignItems="center"
        borderStyle="rounded"
        borderColor="#333333"
      >
        <text attributes={TextAttributes.DIM}>No results yet. Try a query or :help.</text>
      </box>
    );
  }

  return (
    <scrollbox
      ref={scrollRef}
      flexGrow={1}
      borderStyle="rounded"
      borderColor="#333333"
      paddingLeft={1}
      paddingRight={1}
      paddingTop={1}
      paddingBottom={1}
    >
      {results.map((result, index) => {
        const isSelected = index === selectedIndex;

        return (
          <box
            key={result.id}
            ref={(node) => {
              if (node) {
                itemRefs.current.set(result.id, node);
              } else {
                itemRefs.current.delete(result.id);
              }
            }}
            flexDirection="column"
            marginBottom={1}
            paddingLeft={1}
            paddingRight={1}
            paddingTop={1}
            paddingBottom={1}
            backgroundColor={isSelected ? "#1d1f21" : "transparent"}
          >
            <box backgroundColor={isSelected ? "#333333" : "transparent"}>
              <text attributes={TextAttributes.BOLD}>{result.title}</text>
              <text attributes={TextAttributes.DIM}>
                {truncate(result.description, MAX_DESCRIPTION_LENGTH)}
              </text>
              <text attributes={TextAttributes.UNDERLINE}>
                {truncateUrl(result.url, MAX_URL_LENGTH)}
              </text>
              <text attributes={TextAttributes.DIM}>{result.pluginDisplayNames.join(", ")}</text>
            </box>
          </box>
        );
      })}
    </scrollbox>
  );
};

export default ResultList;
