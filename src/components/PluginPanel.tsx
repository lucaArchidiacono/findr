import { TextAttributes } from "@opentui/core";
import type { FC } from "react";
import type { PluginRegistration } from "../core/plugins";

interface PluginPanelProps {
  plugins: PluginRegistration[];
  selectedIndex: number;
  visible: boolean;
}

export const PluginPanel: FC<PluginPanelProps> = ({ plugins, selectedIndex, visible }) => {
  if (!visible) {
    return null;
  }

  return (
    <scrollbox
      width={32}
      marginLeft={1}
      borderStyle="round"
      borderColor="#444444"
      paddingLeft={1}
      paddingRight={1}
      paddingTop={1}
      paddingBottom={1}
    >
      <text attributes={TextAttributes.BOLD} marginBottom={1}>
        Plugins
      </text>
      {plugins.map((registration, index) => {
        const isSelected = index === selectedIndex;
        const marker = registration.enabled ? "[x]" : "[ ]";

        return (
          <box
            key={registration.plugin.id}
            flexDirection="column"
            marginBottom={1}
            backgroundColor={isSelected ? "#1d1f21" : "transparent"}
            paddingLeft={1}
            paddingRight={1}
            paddingTop={1}
            paddingBottom={1}
          >
            <text>
              {marker} {registration.plugin.displayName}
            </text>
            {registration.plugin.description ? (
              <text attributes={TextAttributes.DIM}>{registration.plugin.description}</text>
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
