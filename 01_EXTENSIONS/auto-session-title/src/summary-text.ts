import { MAX_SECTION_LENGTH, MAX_TRANSCRIPT_LENGTH } from "./summary-types.js";
import type { OverviewEntry } from "./overview-types.js";

function collapseWhitespace(text: string): string {
	return text.replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim();
}

function truncateSection(text: string, maxLength: number = MAX_SECTION_LENGTH): string {
	const collapsed = collapseWhitespace(text);
	return collapsed.length <= maxLength ? collapsed : `${collapsed.slice(0, maxLength - 1).trimEnd()}…`;
}

function extractTextContent(content: unknown): string[] {
	if (typeof content === "string") return [content];
	return Array.isArray(content) ? content.filter((part): part is { type: "text"; text: string } => Boolean(part) && typeof part === "object" && part.type === "text" && typeof part.text === "string").map((part) => part.text) : [];
}

function extractToolCalls(content: unknown): string[] {
	if (!Array.isArray(content)) return [];
	return content.filter((part): part is { type: string; name: string; arguments?: unknown } => Boolean(part) && typeof part === "object" && part.type === "toolCall" && typeof part.name === "string").map((part) => truncateSection(`Tool ${part.name}: ${typeof part.arguments === "object" && part.arguments !== null ? JSON.stringify(part.arguments) : "{}"}`, 180));
}

function clipTranscript(text: string): string {
	if (text.length <= MAX_TRANSCRIPT_LENGTH) return text;
	const head = text.slice(0, 4000).trimEnd();
	const tail = text.slice(-(MAX_TRANSCRIPT_LENGTH - head.length - 32)).trimStart();
	return `${head}\n\n[... earlier context omitted ...]\n\n${tail}`;
}

export function extractSummaryLines(raw: string): string[] {
	return raw.split(/\r?\n/).map((line) => collapseWhitespace(line.replace(/^[-*•]\s*/, ""))).filter(Boolean);
}

export function buildConversationTranscript(entries: OverviewEntry[]): string {
	const lines: string[] = [];
	for (const entry of entries) {
		if ((entry.type === "compaction" || entry.type === "branch_summary") && entry.summary) lines.push(`${entry.type === "compaction" ? "Compaction" : "Branch"} summary: ${truncateSection(entry.summary)}`);
		if (entry.type !== "message" || !entry.message?.role) continue;
		if (entry.message.role === "user") lines.push(...extractTextContent(entry.message.content).join(" ") ? [`User: ${truncateSection(extractTextContent(entry.message.content).join(" "))}`] : []);
		if (entry.message.role === "assistant") {
			const text = truncateSection(extractTextContent(entry.message.content).join(" "));
			if (text) lines.push(`Assistant: ${text}`);
			lines.push(...extractToolCalls(entry.message.content));
		}
		if (entry.message.role === "toolResult") {
			const text = truncateSection(extractTextContent(entry.message.content).join(" "), 180);
			if (text) lines.push(`Tool result ${entry.message.toolName || "tool"}: ${text}`);
		}
	}
	return clipTranscript(lines.join("\n"));
}
