import type { EventName, HookKind } from "./types.js";

export const SUPPORTED_EVENTS = new Set<EventName>([
	"SessionStart",
	"UserPromptSubmit",
	"InstructionsLoaded",
	"PreToolUse",
	"PostToolUse",
	"PostToolUseFailure",
	"PreCompact",
	"PostCompact",
	"SessionEnd",
	"Stop",
	"SubagentStart",
	"SubagentStop",
	"ConfigChange",
	"FileChanged",
]);

export const PROMPT_AGENT_EVENTS = new Set<EventName>([
	"UserPromptSubmit",
	"PreToolUse",
	"PostToolUse",
	"PostToolUseFailure",
	"Stop",
	"SubagentStop",
]);

export const DEFAULT_TIMEOUT_SECONDS = {
	command: 600,
	http: 30,
	prompt: 30,
	agent: 60,
} as const satisfies Record<HookKind, number>;

export function hookTypeAllowed(eventName: EventName, type: HookKind): boolean {
	if (eventName === "SessionStart") return type === "command";
	return type === "command" || type === "http" || PROMPT_AGENT_EVENTS.has(eventName);
}
