import type { UsageStats } from "./types.js";

export interface ParsedEvent {
	type: "message" | "message_delta" | "tool_start" | "tool_update" | "tool_end" | "agent_end";
	text?: string;
	usage?: Partial<UsageStats>;
	toolName?: string;
	stopReason?: string;
	isError?: boolean;
}

export interface AssistantMessageEvent {
	type?: string;
	delta?: string;
	reason?: string;
	error?: { message?: string } | string;
}

export interface AssistantMessage {
	role?: string;
	content?: Array<{ type?: string; text?: string }>;
	usage?: Record<string, number>;
	stopReason?: string;
}

export const eventTypes = [
	"message_update",
	"message_end",
	"tool_execution_start",
	"tool_execution_update",
	"tool_execution_end",
	"agent_end",
];
