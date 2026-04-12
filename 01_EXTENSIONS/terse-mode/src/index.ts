import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { createTerseCommand } from "./command.js";
import { saveGlobalState } from "./config.js";
import { onBeforeAgentStart, onRestore } from "./handlers.js";

export default function (pi: ExtensionAPI) {
	pi.registerCommand("terse", createTerseCommand(saveGlobalState));
	pi.on("session_start", onRestore());
	pi.on("session_tree", onRestore());
	pi.on("before_agent_start", onBeforeAgentStart());
}
