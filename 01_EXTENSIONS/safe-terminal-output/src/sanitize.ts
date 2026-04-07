import type { AssistantMessage, AssistantMessageEvent } from "@mariozechner/pi-ai";

const CONTROL_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g;
const INVISIBLE_RE = /[\u200B-\u200F\u202A-\u202E\u2060-\u2069]/g;
const VARIATION_RE = /[\uFE00-\uFE0F]/g;

export function sanitizeText(text: string): string {
	return text.replace(/\u2028|\u2029/g, "\n").replace(CONTROL_RE, "").replace(INVISIBLE_RE, "").replace(VARIATION_RE, "");
}

export function sanitizeValue(value: unknown): unknown {
	if (typeof value === "string") return sanitizeText(value);
	if (Array.isArray(value)) { for (let i = 0; i < value.length; i++) value[i] = sanitizeValue(value[i]); return value; }
	if (!value || typeof value !== "object") return value;
	for (const [key, child] of Object.entries(value)) (value as Record<string, unknown>)[key] = sanitizeValue(child);
	return value;
}

export function sanitizeMessage(message: AssistantMessage): void {
	for (const block of message.content) {
		if (block.type === "text") block.text = sanitizeText(block.text);
		if (block.type === "thinking") block.thinking = sanitizeText(block.thinking);
		if (block.type === "toolCall") sanitizeValue(block.arguments);
	}
	if (message.errorMessage) message.errorMessage = sanitizeText(message.errorMessage);
}

export function sanitizeEvent(event: AssistantMessageEvent): void {
	if ("delta" in event) event.delta = sanitizeText(event.delta);
	if ("content" in event) event.content = sanitizeText(event.content);
	if ("partial" in event) sanitizeMessage(event.partial);
	if ("toolCall" in event) sanitizeValue(event.toolCall.arguments);
	if ("message" in event) sanitizeMessage(event.message);
	if ("error" in event) sanitizeMessage(event.error);
}
