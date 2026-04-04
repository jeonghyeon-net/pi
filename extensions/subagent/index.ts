import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { registerAll } from "./core/command.js";
import { checkForHungRuns } from "./core/run.js";
import { createStore } from "./core/store.js";
import { HANG_CHECK_INTERVAL_MS } from "./core/types.js";

export default function (pi: ExtensionAPI) {
  const store = createStore();
  registerAll(pi, store);

  const hangCheckTimer = setInterval(() => checkForHungRuns(store, pi), HANG_CHECK_INTERVAL_MS);

  pi.on("session_shutdown", async () => {
    clearInterval(hangCheckTimer);
  });
}
