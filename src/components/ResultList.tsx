import { TextAttributes } from "@opentui/core";
import type { AggregatedSearchResult } from "../core/plugins";
import { truncate, truncateUrl } from "../utils/formatting";

interface ResultListProps {
  results: AggregatedSearchResult[];
  selectedIndex: number;
  isLoading: boolean;
}

const MAX_DESCRIPTION_LENGTH = 120;
const MAX_URL_LENGTH = 60;

export const ResultList = ({ results, selectedIndex, isLoading }: ResultListProps) => {
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
              <text attributes={TextAttributes.DIM}>{result.pluginDisplayName}</text>
            </box>

            {/* <box backgroundColor={"#bbbbbb"}></box>
            <box backgroundColor={"#6d9bf1"}></box> */}
          </box>
        );
      })}
    </scrollbox>
  );
};

export default ResultList;
