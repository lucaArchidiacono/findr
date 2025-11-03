import { BoxRenderable, ScrollBoxRenderable, TextAttributes } from "@opentui/core";
import { useEffect, useRef } from "react";
import type { SearchPlugin } from "../core/plugins";

interface PluginPanelProps {
  plugins: SearchPlugin[];
  enabledPluginIds: string[];
  selectedIndex: number;
  visible: boolean;
  focused: boolean;
}

export const PluginPanel = ({
  plugins,
  enabledPluginIds,
  selectedIndex,
  visible,
  focused,
}: PluginPanelProps) => {
  const scrollRef = useRef<ScrollBoxRenderable | null>(null);
  const itemRefs = useRef<Map<string, BoxRenderable>>(new Map());

  useEffect(() => {
    if (!visible) {
      return;
    }

    const scrollbox = scrollRef.current;
    if (!scrollbox) {
      return;
    }
    const selected = plugins[selectedIndex];
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
  }, [plugins, selectedIndex, visible]);

  if (!visible) {
    return null;
  }

  return (
    <box
      flexDirection="column"
      flexGrow={0}
      flexShrink={0}
      marginLeft={1}
      width={32}
      alignSelf="stretch"
      borderStyle="rounded"
      borderColor={focused ? "#FFFFFF" : "#555555"}
      minHeight={0}
    >
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
              ref={(node) => {
                if (node) {
                  itemRefs.current.set(plugin.id, node);
                } else {
                  itemRefs.current.delete(plugin.id);
                }
              }}
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
    </box>
  );
};

export default PluginPanel;
