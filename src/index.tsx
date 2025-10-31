import { render } from "@opentui/react";
import App from "./components/App";
import { ConsolePosition } from "@opentui/core";

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
