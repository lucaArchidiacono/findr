import { TextAttributes } from "@opentui/core";
import type { CommandFeedback } from "../state/appState";

interface FeedbackBarProps {
  feedback?: CommandFeedback;
  errorMessage?: string;
  pluginErrors: string[];
}

const toneColor: Record<CommandFeedback["tone"], string> = {
  info: "#8dc891",
  error: "#ff6b6b",
};

export const FeedbackBar = ({ feedback, errorMessage, pluginErrors }: FeedbackBarProps) => {
  const pluginErrorMessage = pluginErrors.join(" | ");

  if (!feedback && !errorMessage && pluginErrors.length === 0) {
    return (
      <box height={1} paddingLeft={1}>
        <text attributes={TextAttributes.DIM}>Type to search or :help for more.</text>
      </box>
    );
  }

  if (feedback) {
    return (
      <box backgroundColor={toneColor[feedback.tone]} height={1} paddingLeft={1}>
        <text>{feedback.message}</text>
      </box>
    );
  }

  if (errorMessage) {
    return (
      <box backgroundColor="#ff6b6b" height={1} paddingLeft={1}>
        <text>{errorMessage}</text>
      </box>
    );
  }

  return (
    <box backgroundColor="#ffa94d" height={1} paddingLeft={1}>
      <text>{pluginErrorMessage}</text>
    </box>
  );
};

export default FeedbackBar;
