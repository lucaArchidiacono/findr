import { render } from "@opentui/react";
import App from "./components/App";
import { ConsolePosition } from "@opentui/core";
import { initBackend } from "./core/backend";

// Initialize the backend (loads external plugins from ~/.config/findr/plugins/)
await initBackend();

render(<App />, {
  ...(Bun.env.DEBUG === "true"
    ? {
        consoleOptions: {
          position: ConsolePosition.LEFT,
          sizePercent: 30,
          colorInfo: "#00FFFF",
          colorWarn: "#FFFF00",
          colorError: "#FF0000",
          startInDebugMode: false,
        },
      }
    : undefined),
});
