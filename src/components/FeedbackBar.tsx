import { TextAttributes } from "@opentui/core";
import type { CommandFeedback } from "../state/appState";

interface FeedbackBarProps {
  feedback?: CommandFeedback;
  errorMessage?: string;
  pluginErrors: string[];
}

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
      <box height={1} paddingLeft={1}>
        <text attributes={TextAttributes.BOLD}>{feedback.message}</text>
      </box>
    );
  }

  if (errorMessage) {
    return (
      <box height={1} paddingLeft={1}>
        <text
          style={{ selectionBg: "#ff6b6b", selectionFg: "#ffffff" }}
          attributes={TextAttributes.BOLD}
        >
          {errorMessage}
        </text>
      </box>
    );
  }

  return (
    <box height={1} paddingLeft={1}>
      <text attributes={TextAttributes.BOLD}>{pluginErrorMessage}</text>
    </box>
  );
};

export default FeedbackBar;
