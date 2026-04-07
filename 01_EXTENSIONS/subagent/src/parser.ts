import { extractAssistantText, parseAssistantUpdate, parseToolEvent, parseUsage } from "./parser-helpers.js";
import { eventTypes } from "./parser-types.js";
import type { AssistantMessage, AssistantMessageEvent, ParsedEvent } from "./parser-types.js";

export type { ParsedEvent } from "./parser-types.js";

type JsonRecord = Record<string, unknown>;
const isRecord = (v: unknown): v is JsonRecord => typeof v === "object" && v !== null;
const hasType = (v: unknown): v is { type: string } => isRecord(v) && typeof v.type === "string";
const isMessage = (v: unknown): v is AssistantMessage => isRecord(v);
const isAssistantEvent = (v: unknown): v is AssistantMessageEvent => isRecord(v);

function parseMessageEnd(evt: unknown): ParsedEvent | null {
	const message = isRecord(evt) && isMessage(evt.message) ? evt.message : undefined;
	if (!message || message.role !== "assistant") return null;
	return { type: "message", text: extractAssistantText(message), usage: parseUsage(message), stopReason: message.stopReason };
}

function parseAgentEnd(evt: unknown): ParsedEvent {
	const messages = isRecord(evt) && Array.isArray(evt.messages) ? evt.messages.filter(isMessage) : [];
	const last = messages.filter((m) => m.role === "assistant").at(-1);
	return { type: "agent_end", text: extractAssistantText(last), usage: parseUsage(last), stopReason: last?.stopReason };
}

type EventRecord = JsonRecord & { type: string };
const toolName = (evt: EventRecord) => typeof evt.toolName === "string" ? evt.toolName : undefined;
const handlers: Record<string, (evt: EventRecord) => ParsedEvent | null> = {
	message_update: (evt) => parseAssistantUpdate(isMessage(evt.message) ? evt.message : undefined, isAssistantEvent(evt.assistantMessageEvent) ? evt.assistantMessageEvent : undefined),
	message_end: parseMessageEnd,
	tool_execution_start: (evt) => parseToolEvent("tool_start", toolName(evt), evt.args),
	tool_execution_update: (evt) => parseToolEvent("tool_update", toolName(evt), evt.partialResult),
	tool_execution_end: (evt) => parseToolEvent("tool_end", toolName(evt), evt.result, evt.isError === true),
	agent_end: parseAgentEnd,
};

export function parseLine(line: string): ParsedEvent | null {
	if (!line.trim()) return null;
	try {
		const evt = JSON.parse(line);
		if (!hasType(evt) || !eventTypes.includes(evt.type)) return null;
		return handlers[evt.type](evt);
	} catch {
		return null;
	}
}
