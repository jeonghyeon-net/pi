import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { isFocused, startFocusTracking, stopFocusTracking } from "./core/focus.js";
import { notify } from "./core/notify.js";

export default function (pi: ExtensionAPI) {
  startFocusTracking();

  pi.on("agent_end", async () => {
    if (!isFocused()) {
      notify("pi", "작업 완료");
    }
  });

  pi.on("session_shutdown", async () => {
    stopFocusTracking();
  });
}
