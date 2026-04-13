import { MAX_SECTION_LENGTH, MAX_TRANSCRIPT_LENGTH } from "./summary-types.js";
import type { OverviewEntry } from "./overview-types.js";
export { extractSummaryLines } from "./summary-lines.js";

interface ToolCallNote {
	line: string;
	toolName: string;
	skipResult: boolean;
}

function collapseWhitespace(text: string): string {
	return text.replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim();
}

function truncateSection(text: string, maxLength: number = MAX_SECTION_LENGTH): string {
	const collapsed = collapseWhitespace(text);
	return collapsed.length <= maxLength ? collapsed : `${collapsed.slice(0, maxLength - 1).trimEnd()}…`;
}

function isRoutineSocialText(text: string): boolean {
	return /^(?:안녕(?:하세요)?|반가워(?:요)?|hi|hello|hey|thanks|thank you|고마워(?:요)?|감사(?:합니다|해요)?)$/iu.test(collapseWhitespace(text).replace(/[.!?~]+$/u, ""));
}

function extractTextContent(content: unknown): string[] {
	if (typeof content === "string") return [content];
	return Array.isArray(content)
		? content.filter((part): part is { type: "text"; text: string } => Boolean(part) && typeof part === "object" && part.type === "text" && typeof part.text === "string").map((part) => part.text)
		: [];
}

function normalizeTextContent(content: unknown): string {
	return collapseWhitespace(extractTextContent(content).join(" "));
}

function hasBashCommandArguments(value: unknown): value is { command: string } {
	if (!value || typeof value !== "object" || !("command" in value)) return false;
	return typeof value.command === "string";
}

function isRoutineBashCommand(argumentsValue: unknown): boolean {
	if (!hasBashCommandArguments(argumentsValue)) return false;
	return /^(?:cd\s+.+?\s*&&\s*)*git\s+branch\s+--show-current$/iu.test(collapseWhitespace(argumentsValue.command));
}

function extractToolCalls(content: unknown): ToolCallNote[] {
	if (!Array.isArray(content)) return [];
	return content.filter((part): part is { type: string; name: string; arguments?: unknown } => Boolean(part) && typeof part === "object" && part.type === "toolCall" && typeof part.name === "string").map((part) => {
		const skipResult = part.name === "bash" && isRoutineBashCommand(part.arguments);
		return {
			toolName: part.name,
			skipResult,
			line: skipResult ? "" : truncateSection(`Tool ${part.name}: ${typeof part.arguments === "object" && part.arguments !== null ? JSON.stringify(part.arguments) : "{}"}`, 180),
		};
	});
}

function clipTranscript(text: string): string {
	if (text.length <= MAX_TRANSCRIPT_LENGTH) return text;
	const head = text.slice(0, 4000).trimEnd();
	const tail = text.slice(-(MAX_TRANSCRIPT_LENGTH - head.length - 32)).trimStart();
	return `${head}\n\n[... earlier context omitted ...]\n\n${tail}`;
}

export function buildConversationTranscript(entries: OverviewEntry[]): string {
	const lines: string[] = [];
	const pendingSkippedResults: Record<string, number> = {};
	for (const entry of entries) {
		if ((entry.type === "compaction" || entry.type === "branch_summary") && entry.summary) lines.push(`${entry.type === "compaction" ? "Compaction" : "Branch"} summary: ${truncateSection(entry.summary)}`);
		if (entry.type !== "message" || !entry.message?.role) continue;
		if (entry.message.role === "user") {
			const text = normalizeTextContent(entry.message.content);
			if (text && !isRoutineSocialText(text)) lines.push(`User: ${truncateSection(text)}`);
		}
		if (entry.message.role === "assistant") {
			const text = normalizeTextContent(entry.message.content);
			if (text && !isRoutineSocialText(text)) lines.push(`Assistant: ${truncateSection(text)}`);
			for (const toolCall of extractToolCalls(entry.message.content)) {
				if (toolCall.skipResult) pendingSkippedResults[toolCall.toolName] = (pendingSkippedResults[toolCall.toolName] ?? 0) + 1;
				if (toolCall.line) lines.push(toolCall.line);
			}
		}
		if (entry.message.role === "toolResult") {
			const toolName = entry.message.toolName || "tool";
			if ((pendingSkippedResults[toolName] ?? 0) > 0) {
				pendingSkippedResults[toolName] -= 1;
				continue;
			}
			const text = truncateSection(normalizeTextContent(entry.message.content), 180);
			if (text) lines.push(`Tool result ${toolName}: ${text}`);
		}
	}
	return clipTranscript(lines.join("\n"));
}
