import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { createClaudeBashTool } from "./bash-tool.js";
import { createClaudeEditTool } from "./edit-tool.js";
import { createClaudeReadTool } from "./read-tool.js";
import { onSessionStart } from "./session-start.js";
import { onAgentEnd, onAgentStart, onMessageUpdate, onSessionShutdown, onToolExecutionEnd, onToolExecutionStart, onTurnStart } from "./working-line.js";
import { createClaudeWriteTool } from "./write-tool.js";

export default function (_pi: ExtensionAPI) {
	_pi.registerTool(createClaudeReadTool(process.cwd()));
	_pi.registerTool(createClaudeBashTool(process.cwd()));
	_pi.registerTool(createClaudeEditTool(process.cwd()));
	_pi.registerTool(createClaudeWriteTool(process.cwd()));
	_pi.on("session_start", onSessionStart);
	_pi.on("agent_start", onAgentStart);
	_pi.on("turn_start", onTurnStart);
	_pi.on("tool_execution_start", onToolExecutionStart);
	_pi.on("tool_execution_end", onToolExecutionEnd);
	_pi.on("message_update", onMessageUpdate);
	_pi.on("agent_end", onAgentEnd);
	_pi.on("session_shutdown", onSessionShutdown);
}
