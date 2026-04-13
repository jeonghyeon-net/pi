import type { AgentEndEvent, ExtensionAPI, ExtensionHandler, SessionStartEvent } from "@mariozechner/pi-coding-agent";
import { createAgentEndHandler, createSessionStartHandler } from "./hooks.js";

export default function (pi: ExtensionAPI) {
	pi.on("session_start", createSessionStartHandler(pi.events) as ExtensionHandler<SessionStartEvent>);
	pi.on("agent_end", createAgentEndHandler() as ExtensionHandler<AgentEndEvent>);
}
