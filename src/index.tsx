import { render } from "@opentui/react";
import App from "./components/App";
import { ConsolePosition } from "@opentui/core";
import { registerBuiltinPlugins } from "./plugins/builtin";
import { Findr } from "./core/findr";

// Load secrets first so API keys are available as env vars
await Findr.loadSecrets();

// Register builtin plugins, load user plugins, then restore saved preferences
registerBuiltinPlugins();
await Findr.loadUserPlugins();
await Findr.loadPreferences();

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
