import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { createProxyTool } from "./proxy-router.js";
import { createMcpCommand } from "./cmd-router.js";
import { onSessionShutdown } from "./lifecycle-shutdown.js";
import { MCP_CONFIG_FLAG } from "./constants.js";
import { wireSessionStart } from "./wire-init.js";
import { wireShutdownOps } from "./wire-shutdown.js";
import { wireProxyDeps, buildProxyDescription } from "./wire-proxy.js";
import { wireCommandConnect, wireCommandClose } from "./wire-command.js";

export default function (_pi: ExtensionAPI) {
	_pi.registerTool(createProxyTool(_pi, buildProxyDescription, wireProxyDeps));
	_pi.registerCommand("mcp", createMcpCommand(_pi, wireCommandConnect(), wireCommandClose()));
	_pi.registerFlag("mcp-config", MCP_CONFIG_FLAG);
	_pi.on("session_start", wireSessionStart(_pi));
	_pi.on("session_shutdown", onSessionShutdown(wireShutdownOps()));
}
