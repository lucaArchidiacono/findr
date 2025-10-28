import { TextAttributes } from "@opentui/core";
import type { FC } from "react";
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

export const FeedbackBar: FC<FeedbackBarProps> = ({ feedback, errorMessage, pluginErrors }) => {
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
      <box height={1} paddingLeft={1}>
        <text color={toneColor[feedback.tone]}>{feedback.message}</text>
      </box>
    );
  }

  if (errorMessage) {
    return (
      <box height={1} paddingLeft={1}>
        <text color="#ff6b6b">{errorMessage}</text>
      </box>
    );
  }

  return (
    <box height={1} paddingLeft={1}>
      <text color="#ffa94d">{pluginErrorMessage}</text>
    </box>
  );
};

export default FeedbackBar;
