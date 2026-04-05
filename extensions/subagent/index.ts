import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { HANG_CHECK_INTERVAL_MS } from "./core/constants.js";
import type { SubagentDeps } from "./core/deps.js";
import { createStore } from "./core/store.js";
import { checkForHungRuns } from "./execution/run.js";
import { registerCommands } from "./register/commands.js";
import { registerEventHandlers } from "./register/events.js";
import { registerInputHandlers } from "./register/input.js";
import { registerTools } from "./register/tools.js";
import { stopSpinnerTimer } from "./ui/widget.js";

export default function (pi: ExtensionAPI) {
  const store = createStore();
  const deps: SubagentDeps = { pi, store };

  registerTools(deps);
  const { subCommand, handleSubClear, handleSubAbort } = registerCommands(deps);
  registerInputHandlers(deps, { subCommand, handleSubClear, handleSubAbort });
  registerEventHandlers(deps);

  const hangCheckTimer = setInterval(() => checkForHungRuns(store, pi), HANG_CHECK_INTERVAL_MS);

  pi.on("session_shutdown", async () => {
    clearInterval(hangCheckTimer);
    stopSpinnerTimer();
  });
}
