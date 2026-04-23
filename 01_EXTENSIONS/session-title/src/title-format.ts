import * as path from "node:path";
import type { SessionTitleContext } from "./title-context.js";

export const TITLE_STATUS_KEY = "session-title";
export const MAX_PROMPT_CHARS = 800;
export const MAX_TITLE_CHARS = 48;
export const MAX_STATUS_CHARS = 72;
export const MAX_TERMINAL_TITLE_CHARS = 60;
export const TITLE_SYSTEM_PROMPT = [
	"You write short, explicit session titles for a coding task.",
	"Preserve the user's language.",
	"Rewrite the request as an organized summary title instead of copying the request verbatim.",
	"Keep the core task, but drop URLs, politeness, commit/push/test instructions, and placement logistics unless they are central.",
	"Make the title concrete and action-oriented.",
	"Include the action and the main object or scope when possible.",
	"Avoid vague titles like 'extension', 'bug', 'question', or 'help'.",
	"Return only the title text with no labels, quotes, or markdown.",
	`Keep it to one line and under ${MAX_TITLE_CHARS} characters.`,
].join(" ");

function clip(text: string, maxChars: number): string {
	if (text.length <= maxChars) return text;
	return `${text.slice(0, maxChars - 1).trimEnd()}…`;
}

function stripWrappingPair(text: string, open: string, close: string): string {
	return text.startsWith(open) && text.endsWith(close) && text.length > open.length + close.length
		? text.slice(open.length, text.length - close.length).trim()
		: text;
}

export function buildTitlePrompt(userPrompt: string): string {
	return `User request:\n${userPrompt.slice(0, MAX_PROMPT_CHARS)}`;
}

export function buildContextTitlePrompt(context: SessionTitleContext): string {
	const sections = [
		context.currentTitle ? `Current session title:\n${context.currentTitle.slice(0, MAX_PROMPT_CHARS)}` : "",
		context.firstUserPrompt ? `Initial user request:\n${context.firstUserPrompt.slice(0, MAX_PROMPT_CHARS)}` : "",
		context.recentUserPrompts.length > 0 ? `Recent user follow-ups:\n${context.recentUserPrompts.map((prompt) => `- ${prompt.slice(0, MAX_PROMPT_CHARS)}`).join("\n")}` : "",
		context.latestAssistantText ? `Latest assistant progress:\n${context.latestAssistantText.slice(0, MAX_PROMPT_CHARS)}` : "",
	].filter(Boolean).join("\n\n");
	return sections ? `Session context:\n${sections}` : "Session context:";
}

export function extractTextContent(content: ReadonlyArray<{ type: string; text?: string }>): string {
	return content.filter((part): part is { type: "text"; text: string } => part.type === "text" && typeof part.text === "string").map((part) => part.text).join("").trim();
}

export function normalizeTitle(rawTitle: string): string {
	const firstLine = rawTitle.split(/\r?\n/gu).map((line) => line.trim()).find(Boolean) ?? "";
	let normalized = firstLine.replace(/^[-*•]\s*/u, "").replace(/^(title|session title|session name|name|제목|세션 제목|세션 이름)\s*[:：-]\s*/iu, "").trim();
	for (const [open, close] of [["\"", "\""], ["'", "'"], ["`", "`"], ["(", ")"], ["[", "]"], ["“", "”"], ["‘", "’"]]) {
		normalized = stripWrappingPair(normalized, open, close);
	}
	return clip(normalized.replace(/\s+/gu, " ").replace(/[.。!！?？:：;；,，\-–—\s]+$/gu, "").trim(), MAX_TITLE_CHARS);
}

const REQUEST_NOISE_RE = /(please|can you|could you|would you|help me|i need you to|이거|참고해서|좀|혹시|작업해줘|구현해줘|만들어줘|해줘|해주세요|commit|push|커밋|푸시)/iu;
const ACTION_LEAD_RE = /^(add|fix|update|implement|create|make|write|refactor|remove|support|improve|enable|simplify|document|rename|move|review|debug|test|investigate|build|convert|ship)\b/iu;

function comparisonText(text: string): string {
	return text.toLowerCase().replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/gu, "$1").replace(/https?:\/\/\S+/gu, " ").replace(/[^\p{L}\p{N}]+/gu, " ").replace(/\s+/gu, " ").trim();
}

export function looksLikePromptCopy(title: string, userPrompt: string): boolean {
	const normalizedTitle = comparisonText(normalizeTitle(title));
	const normalizedPrompt = comparisonText(userPrompt);
	if (!normalizedTitle || !normalizedPrompt) return false;
	if (normalizedPrompt === normalizedTitle || normalizedPrompt.startsWith(normalizedTitle) || normalizedTitle.startsWith(normalizedPrompt)) return true;
	const promptTokens = normalizedPrompt.split(" ");
	const titleTokens = normalizedTitle.split(" ");
	const overlap = titleTokens.filter((token) => promptTokens.includes(token)).length;
	return titleTokens.length >= 3 && ACTION_LEAD_RE.test(normalizedTitle) && overlap / titleTokens.length >= 0.85;
}

export function isClearSummaryTitle(title: string): boolean {
	const normalized = normalizeTitle(title);
	return normalized.length > 0 && !REQUEST_NOISE_RE.test(normalized) && !/[?？]/u.test(normalized);
}

export function formatStatusTitle(title: string): string {
	return clip(title.replace(/\s+/gu, " ").trim(), MAX_STATUS_CHARS);
}

export function formatTerminalTitle(title: string | undefined, cwd: string): string {
	const projectName = path.basename(cwd) || "pi";
	const clippedTitle = title ? clip(title.replace(/\s+/gu, " ").trim(), MAX_TERMINAL_TITLE_CHARS) : undefined;
	return clippedTitle ? `π - ${clippedTitle} - ${projectName}` : `π - ${projectName}`;
}
