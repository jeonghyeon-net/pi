const MAX_CONTEXT_TEXT_CHARS = 280;
const MAX_RECENT_USER_PROMPTS = 3;

type TextPart = { type?: string; text?: string };
type MessageLike = { role?: string; content?: string | TextPart[] };
type SessionEntryLike = { type?: string; message?: MessageLike };
type SessionManagerLike = {
	getBranch?: () => SessionEntryLike[];
	getEntries?: () => SessionEntryLike[];
};

export type SessionTitleContext = {
	currentTitle?: string;
	firstUserPrompt: string;
	recentUserPrompts: string[];
	latestAssistantText: string;
};

function clipContextText(text: string): string {
	if (text.length <= MAX_CONTEXT_TEXT_CHARS) return text;
	return `${text.slice(0, MAX_CONTEXT_TEXT_CHARS - 1).trimEnd()}…`;
}

function normalizeContextText(text: string): string {
	return clipContextText(text.replace(/[\r\n\t]+/gu, " ").replace(/\s+/gu, " ").trim());
}

function extractMessageText(message: MessageLike | undefined): string {
	if (!message) return "";
	if (typeof message.content === "string") return normalizeContextText(message.content);
	if (!Array.isArray(message.content)) return "";
	return normalizeContextText(
		message.content
			.filter((part): part is TextPart => !!part && typeof part === "object")
			.map((part) => (part.type === "text" && typeof part.text === "string" ? part.text : ""))
			.join(" "),
	);
}

function getSessionEntries(sessionManager: SessionManagerLike): SessionEntryLike[] {
	if (typeof sessionManager.getBranch === "function") return sessionManager.getBranch();
	if (typeof sessionManager.getEntries === "function") return sessionManager.getEntries();
	return [];
}

function pushUniqueText(items: string[], value: string): void {
	if (!value) return;
	if (items.includes(value)) return;
	items.push(value);
}

export function extractSessionTitleContext(
	sessionManager: SessionManagerLike,
	currentTitle?: string,
	pendingUserPrompt?: string,
): SessionTitleContext {
	const userPrompts: string[] = [];
	let latestAssistantText = "";
	for (const entry of getSessionEntries(sessionManager)) {
		if (entry?.type !== "message") continue;
		const role = entry.message?.role;
		const text = extractMessageText(entry.message);
		if (!text) continue;
		if (role === "user") pushUniqueText(userPrompts, text);
		if (role === "assistant") latestAssistantText = text;
	}
	pushUniqueText(userPrompts, normalizeContextText(pendingUserPrompt ?? ""));
	return {
		currentTitle: currentTitle?.trim() || undefined,
		firstUserPrompt: userPrompts[0] ?? "",
		recentUserPrompts: userPrompts.slice(-MAX_RECENT_USER_PROMPTS),
		latestAssistantText,
	};
}

export function buildFallbackSourceFromContext(context: SessionTitleContext): string {
	return [context.recentUserPrompts.at(-1), context.firstUserPrompt, context.latestAssistantText]
		.filter((value): value is string => !!value)
		.join("\n");
}
