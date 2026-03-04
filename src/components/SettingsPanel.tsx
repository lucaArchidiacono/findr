import { BoxRenderable, ScrollBoxRenderable, TextAttributes } from "@opentui/core";
import { useEffect, useRef } from "react";

export interface SettingsEntry {
  pluginName: string;
  pluginDisplayName: string;
  envVarName: string;
  isConfigured: boolean;
  maskedValue: string;
}

interface SettingsPanelProps {
  entries: SettingsEntry[];
  selectedIndex: number;
  editing: boolean;
  editValue: string;
  onEditChange: (value: string) => void;
  onEditSubmit: () => void;
}

export const SettingsPanel = ({
  entries,
  selectedIndex,
  editing,
  editValue,
  onEditChange,
  onEditSubmit,
}: SettingsPanelProps) => {
  const scrollRef = useRef<ScrollBoxRenderable | null>(null);
  const itemRefs = useRef<Map<string, BoxRenderable>>(new Map());

  useEffect(() => {
    const scrollbox = scrollRef.current;
    if (!scrollbox) return;
    const entry = entries[selectedIndex];
    if (!entry) return;
    const target = itemRefs.current.get(entry.envVarName);
    if (!target) return;
    const viewport = scrollbox.viewport;
    if (!viewport) return;
    const viewportHeight = viewport.height;
    if (viewportHeight <= 0) return;

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
  }, [entries, selectedIndex]);

  return (
    <box flexDirection="column" flexGrow={1} borderStyle="rounded" borderColor="#FFFFFF">
      <box paddingLeft={2} paddingTop={1} height={2}>
        <text attributes={TextAttributes.BOLD}>Settings — API Keys (Escape to close)</text>
      </box>

      <scrollbox
        ref={scrollRef}
        flexGrow={1}
        flexShrink={1}
        flexBasis={0}
        minHeight={0}
        paddingLeft={2}
        paddingRight={2}
        paddingBottom={1}
      >
        {entries.length === 0 ? (
          <text attributes={TextAttributes.DIM}>No plugins require API keys.</text>
        ) : null}

        {entries.map((entry, index) => {
          const isSelected = index === selectedIndex;
          const isEditingThis = isSelected && editing;
          const statusIcon = entry.isConfigured ? "[OK]" : "[  ]";

          return (
            <box
              key={entry.envVarName}
              ref={(node) => {
                if (node) {
                  itemRefs.current.set(entry.envVarName, node);
                } else {
                  itemRefs.current.delete(entry.envVarName);
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
              <text>
                {statusIcon} {entry.pluginDisplayName} ({entry.envVarName})
              </text>
              {isEditingThis ? (
                <box flexDirection="row" alignItems="center" marginTop={1}>
                  <text marginRight={1}>Key:</text>
                  <input
                    value={editValue}
                    placeholder="Paste API key..."
                    focused={true}
                    onInput={(v) => onEditChange(String(v ?? ""))}
                    onSubmit={onEditSubmit}
                    flexGrow={1}
                    height={1}
                  />
                </box>
              ) : (
                <text attributes={TextAttributes.DIM}>{entry.maskedValue}</text>
              )}
            </box>
          );
        })}
      </scrollbox>

      <box paddingLeft={2} paddingBottom={1} height={2}>
        <text attributes={TextAttributes.DIM}>
          Up/Down: navigate | Enter: edit key | Escape: back
        </text>
      </box>
    </box>
  );
};

export default SettingsPanel;
