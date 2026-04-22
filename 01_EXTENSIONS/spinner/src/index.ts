import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { onSessionStart } from "./session-start.js";

export default function (_pi: ExtensionAPI) {
	_pi.on("session_start", onSessionStart);
}
