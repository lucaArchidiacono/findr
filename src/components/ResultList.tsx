import type { SearchResult } from "../core/findr";
import { truncate, truncateUrl } from "../utils/formatting";
import { BoxRenderable, ScrollBoxRenderable, TextAttributes } from "@opentui/core";
import { useEffect, useRef, useMemo } from "react";

interface ResultListProps {
  results: SearchResult[];
  selectedIndex: number;
  isLoading: boolean;
  focused: boolean;
  filterActive: boolean;
  filterText: string;
  onFilterChange(text: string): void;
}

const MAX_DESCRIPTION_LENGTH = 120;
const MAX_URL_LENGTH = 60;

function highlightText(
  text: string,
  words: string[],
): Array<{ text: string; highlight: boolean }> {
  if (words.length === 0) return [{ text, highlight: false }];

  const pattern = words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  const regex = new RegExp(`(${pattern})`, "gi");
  const parts: Array<{ text: string; highlight: boolean }> = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ text: text.slice(lastIndex, match.index), highlight: false });
    }
    parts.push({ text: match[0], highlight: true });
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push({ text: text.slice(lastIndex), highlight: false });
  }

  return parts.length > 0 ? parts : [{ text, highlight: false }];
}

function HighlightedText({
  text,
  words,
  dim,
}: {
  text: string;
  words: string[];
  dim?: boolean;
}) {
  const parts = highlightText(text, words);
  const baseAttr = dim ? TextAttributes.DIM : 0;

  if (parts.length === 1 && !parts[0]!.highlight) {
    return <text attributes={baseAttr}>{text}</text>;
  }

  return (
    <text>
      {parts.map((part, i) => (
        <span
          key={i}
          attributes={part.highlight ? TextAttributes.BOLD | TextAttributes.UNDERLINE : baseAttr}
          fg={part.highlight ? "#FFD700" : undefined}
        >
          {part.text}
        </span>
      ))}
    </text>
  );
}

export const ResultList = ({
  results,
  selectedIndex,
  isLoading,
  focused,
  filterActive,
  filterText,
  onFilterChange,
}: ResultListProps) => {
  const scrollRef = useRef<ScrollBoxRenderable | null>(null);
  const itemRefs = useRef<Map<string, BoxRenderable>>(new Map());

  const filterWords = useMemo(() => {
    if (!filterText.trim()) return [];
    return filterText.trim().toLowerCase().split(/\s+/).filter(Boolean);
  }, [filterText]);

  const filteredResults = useMemo(() => {
    if (filterWords.length === 0) return results;
    return results.filter((r) => {
      const haystack =
        `${r.title} ${r.description} ${r.url} ${r.pluginDisplayNames.join(" ")}`.toLowerCase();
      return filterWords.every((word) => haystack.includes(word));
    });
  }, [results, filterWords]);

  const displayResults = filterActive ? filteredResults : results;

  useEffect(() => {
    const scrollbox = scrollRef.current;
    if (!scrollbox) {
      return;
    }
    const selected = displayResults[selectedIndex];
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
  }, [displayResults, selectedIndex]);

  const showEmptyMessage = displayResults.length === 0;
  const emptyMessage = isLoading
    ? "Searching…"
    : filterActive && filterWords.length > 0
      ? "No matching results."
      : "No results yet. Try a query or /help.";

  return (
    <box
      flexGrow={1}
      flexShrink={1}
      flexBasis={0}
      flexDirection="column"
      minHeight={0}
      alignSelf="stretch"
      borderStyle="rounded"
      borderColor={focused ? "#FFFFFF" : "#555555"}
    >
      {filterActive ? (
        <box
          flexDirection="row"
          alignItems="center"
          paddingLeft={1}
          paddingRight={1}
          height={1}
        >
          <text fg="#FFD700">/</text>
          <input
            value={filterText}
            placeholder="filter results..."
            focused={filterActive && focused}
            onInput={(value) => onFilterChange(String(value ?? ""))}
            flexGrow={1}
            height={1}
          />
        </box>
      ) : null}

      {showEmptyMessage ? (
        <box
          flexGrow={1}
          justifyContent="center"
          alignItems="center"
          paddingLeft={1}
          paddingRight={1}
          paddingTop={1}
          paddingBottom={1}
        >
          <text attributes={TextAttributes.DIM}>{emptyMessage}</text>
        </box>
      ) : (
        <scrollbox
          ref={scrollRef}
          flexGrow={1}
          flexShrink={1}
          flexBasis={0}
          minHeight={0}
          paddingLeft={1}
          paddingRight={1}
          paddingTop={1}
          paddingBottom={1}
        >
          {displayResults.map((result, index) => {
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
                {filterWords.length > 0 ? (
                  <HighlightedText text={result.title} words={filterWords} />
                ) : (
                  <text attributes={TextAttributes.BOLD}>{result.title}</text>
                )}
                {filterWords.length > 0 ? (
                  <HighlightedText
                    text={truncate(result.description, MAX_DESCRIPTION_LENGTH)}
                    words={filterWords}
                    dim
                  />
                ) : (
                  <text attributes={TextAttributes.DIM}>
                    {truncate(result.description, MAX_DESCRIPTION_LENGTH)}
                  </text>
                )}
                <text attributes={TextAttributes.UNDERLINE}>
                  {truncateUrl(result.url, MAX_URL_LENGTH)}
                </text>
                <text attributes={TextAttributes.DIM}>{result.pluginDisplayNames.join(", ")}</text>
              </box>
            );
          })}
          {isLoading ? (
            <box justifyContent="center" marginTop={1}>
              <text attributes={TextAttributes.DIM}>Searching…</text>
            </box>
          ) : null}
        </scrollbox>
      )}
    </box>
  );
};

export default ResultList;
