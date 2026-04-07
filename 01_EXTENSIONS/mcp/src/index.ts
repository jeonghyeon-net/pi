import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { createProxyTool } from "./proxy-router.js";
import { createMcpCommand } from "./cmd-router.js";
import { onSessionShutdown } from "./lifecycle-shutdown.js";
import { MCP_CONFIG_FLAG } from "./constants.js";
import { wireSessionStart } from "./wire-init.js";
import { wireShutdownOps } from "./wire-shutdown.js";
import { wireProxyDeps, buildProxyDescription } from "./wire-proxy.js";
import { wireCommandConnect, wireCommandClose } from "./wire-command.js";

export default function (pi: ExtensionAPI) {
	pi.registerTool(createProxyTool(pi, buildProxyDescription, wireProxyDeps));
	pi.registerCommand("mcp", createMcpCommand(pi, wireCommandConnect(), wireCommandClose()));
	pi.registerFlag("mcp-config", MCP_CONFIG_FLAG);
	pi.on("session_start", wireSessionStart(pi));
	pi.on("session_shutdown", onSessionShutdown(wireShutdownOps()));
}
