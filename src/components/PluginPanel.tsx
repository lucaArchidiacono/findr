import { TextAttributes } from "@opentui/core";
import type { SearchPlugin } from "../core/plugins";

interface PluginPanelProps {
  plugins: SearchPlugin[];
  enabledPluginIds: string[];
  selectedIndex: number;
  visible: boolean;
}

export const PluginPanel = ({
  plugins,
  enabledPluginIds,
  selectedIndex,
  visible,
}: PluginPanelProps) => {
  if (!visible) {
    return null;
  }

  return (
    <scrollbox
      width={32}
      marginLeft={1}
      borderStyle="rounded"
      borderColor="#444444"
      paddingLeft={1}
      paddingRight={1}
      paddingTop={1}
      paddingBottom={1}
    >
      <text attributes={TextAttributes.BOLD} marginBottom={1}>
        Plugins
      </text>
      {plugins.map((plugin, index) => {
        const isSelected = index === selectedIndex;
        const marker = enabledPluginIds.includes(plugin.id) ? "[x]" : "[ ]";

        return (
          <box
            key={plugin.id}
            flexDirection="column"
            marginBottom={1}
            backgroundColor={isSelected ? "#1d1f21" : "transparent"}
            paddingLeft={1}
            paddingRight={1}
            paddingTop={1}
            paddingBottom={1}
          >
            <text>
              {marker} {plugin.displayName}
            </text>
            {plugin.description ? (
              <text attributes={TextAttributes.DIM}>{plugin.description}</text>
            ) : null}
          </box>
        );
      })}
      {plugins.length === 0 ? (
        <text attributes={TextAttributes.DIM}>No plugins registered.</text>
      ) : null}
    </scrollbox>
  );
};

export default PluginPanel;
