import { previewText } from "./format.js";
import type { AssistantMessage, AssistantMessageEvent, ParsedEvent } from "./parser-types.js";

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;

export function parseUsage(message: AssistantMessage | undefined) {
	if (!message?.usage) return undefined;
	return {
		inputTokens: message.usage.inputTokens ?? 0,
		outputTokens: message.usage.outputTokens ?? 0,
		turns: 1,
	};
}

export function extractAssistantText(message: AssistantMessage | undefined): string {
	if (!message || message.role !== "assistant") return "";
	return message.content?.filter((c) => c.type === "text").map((c) => c.text).join("\n") ?? "";
}

function extractToolText(result: unknown): string {
	if (!result || typeof result !== "object") return typeof result === "string" ? result : "";
	if (!("content" in result) || !Array.isArray(result.content)) return "";
	return result.content
		.filter((c): c is { type?: string; text?: string } => typeof c === "object" && c !== null)
		.filter((c) => c.type === "text" && typeof c.text === "string")
		.map((c) => c.text)
		.join("\n");
}

export function summarizeArgs(args: unknown): string {
	if (!isRecord(args)) return typeof args === "string" ? previewText(args, 80) : "";
	const obj = args;
	for (const key of ["command", "path", "query", "tool", "server", "url", "text"]) {
		if (typeof obj[key] === "string" && obj[key]) return previewText(obj[key], 80);
	}
	return previewText(JSON.stringify(args), 80);
}

export function parseAssistantUpdate(message: AssistantMessage | undefined, delta: AssistantMessageEvent | undefined): ParsedEvent | null {
	if (message?.role !== "assistant" || !delta?.type) return null;
	if (delta.type === "text_delta" && delta.delta) return { type: "message_delta", text: delta.delta };
	if (delta.type === "done") return { type: "agent_end", stopReason: delta.reason ?? message.stopReason };
	if (delta.type !== "error") return null;
	const err = typeof delta.error === "string" ? delta.error : delta.error?.message;
	return { type: "agent_end", stopReason: delta.reason ?? "error", text: err, isError: true };
}

export function parseToolEvent(type: "tool_start" | "tool_update" | "tool_end", toolName: string | undefined, data: unknown, isError?: boolean): ParsedEvent {
	const text = previewText(extractToolText(data), 120);
	if (type === "tool_start") return { type, toolName, text: summarizeArgs(data) };
	return type === "tool_end" ? { type, toolName, text, isError: !!isError } : { type, toolName, text };
}
