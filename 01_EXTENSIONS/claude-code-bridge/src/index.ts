import type { ExtensionAPI as PiApi } from "@mariozechner/pi-coding-agent";
import { createAgentEndHandler, createSessionBeforeCompactHandler, createSessionCompactHandler, createSessionShutdownHandler } from "./runtime/agent.js";
import { createClaudeBridgeCommand, createTrustHooksCommand, createUntrustHooksCommand } from "./runtime/commands.js";
import { handleBeforeAgentStart, handleContext, createSessionStartHandler } from "./runtime/context.js";
import { createInputHandler } from "./runtime/input.js";
import { createToolCallHandler } from "./runtime/tool-call.js";
import { createToolResultHandler } from "./runtime/tool-result.js";
import { createUserBashHandler } from "./runtime/user-bash.js";

export default function (pi: PiApi) {
	pi.on("session_start", createSessionStartHandler(pi));
	pi.on("input", createInputHandler(pi));
	pi.on("before_agent_start", handleBeforeAgentStart);
	pi.on("context", handleContext);
	pi.on("tool_call", createToolCallHandler(pi));
	pi.on("user_bash", createUserBashHandler(pi));
	pi.on("tool_result", createToolResultHandler(pi));
	pi.on("agent_end", createAgentEndHandler(pi));
	pi.on("session_before_compact", createSessionBeforeCompactHandler(pi));
	pi.on("session_compact", createSessionCompactHandler(pi));
	pi.on("session_shutdown", createSessionShutdownHandler(pi));
	pi.registerCommand("claude-bridge", createClaudeBridgeCommand());
	pi.registerCommand("claude-bridge-trust-hooks", createTrustHooksCommand());
	pi.registerCommand("claude-bridge-untrust-hooks", createUntrustHooksCommand());
}
