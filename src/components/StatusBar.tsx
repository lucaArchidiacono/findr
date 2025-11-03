import { TextAttributes } from "@opentui/core";
import type { SortOrder } from "../core/backend";
import type { AppState } from "../state/appState";

interface StatusBarProps {
  sortOrder: SortOrder;
  enabledPlugins: number;
  totalPlugins: number;
  activePane: AppState["activePane"];
}

const paneLabel: Record<AppState["activePane"], string> = {
  search: "Search",
  results: "Results",
  plugins: "Plugins",
};

export const StatusBar = ({
  sortOrder,
  enabledPlugins,
  totalPlugins,
  activePane,
}: StatusBarProps) => {
  return (
    <box
      flexDirection="row"
      justifyContent="space-between"
      paddingLeft={1}
      paddingRight={1}
      height={1}
    >
      <text>
        Mode: <span attributes={TextAttributes.BOLD}>{paneLabel[activePane]}</span> | Sort:{" "}
        <span attributes={TextAttributes.BOLD}>{sortOrder}</span> | Plugins:{" "}
        <span attributes={TextAttributes.BOLD}>
          {enabledPlugins}/{totalPlugins}
        </span>
      </text>
      <text attributes={TextAttributes.DIM}>
        Use Tab to switch panes · Enter to search/select · :help for commands
      </text>
    </box>
  );
};

export default StatusBar;
