import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { createProxyTool } from "./proxy-router.js";
import { createMcpCommand } from "./cmd-router.js";
import { onSessionStart } from "./lifecycle-init.js";
import { onSessionShutdown } from "./lifecycle-shutdown.js";
import { MCP_CONFIG_FLAG } from "./constants.js";

export default function (pi: ExtensionAPI) {
	pi.registerTool(createProxyTool(pi));
	pi.registerCommand("mcp", createMcpCommand(pi));
	pi.registerFlag("mcp-config", MCP_CONFIG_FLAG);
	pi.on("session_start", onSessionStart(pi));
	pi.on("session_shutdown", onSessionShutdown(pi));
}
