import type { AgentEndEvent, ExtensionAPI, ExtensionHandler, InputEvent, InputEventResult, SessionShutdownEvent, SessionStartEvent, SessionTreeEvent, TurnEndEvent } from "@mariozechner/pi-coding-agent";
import { createAgentEndHandler, createInputHandler, createSessionShutdownHandler, createSessionStartHandler, createSessionTreeHandler, createTurnEndHandler } from "./hooks.js";

export default function (pi: ExtensionAPI) {
	pi.on("input", createInputHandler() as ExtensionHandler<InputEvent, InputEventResult>);
	pi.on("session_start", createSessionStartHandler(() => pi.getSessionName(), (name: string) => pi.setSessionName(name), <T>(customType: string, data?: T) => pi.appendEntry(customType, data)) as ExtensionHandler<SessionStartEvent>);
	pi.on("session_tree", createSessionTreeHandler(() => pi.getSessionName(), (name: string) => pi.setSessionName(name), <T>(customType: string, data?: T) => pi.appendEntry(customType, data)) as ExtensionHandler<SessionTreeEvent>);
	pi.on("turn_end", createTurnEndHandler(() => pi.getSessionName(), (name: string) => pi.setSessionName(name), <T>(customType: string, data?: T) => pi.appendEntry(customType, data)) as ExtensionHandler<TurnEndEvent>);
	pi.on("agent_end", createAgentEndHandler(() => pi.getSessionName(), (name: string) => pi.setSessionName(name), <T>(customType: string, data?: T) => pi.appendEntry(customType, data), pi.events) as ExtensionHandler<AgentEndEvent>);
	pi.on("session_shutdown", createSessionShutdownHandler() as ExtensionHandler<SessionShutdownEvent>);
}
