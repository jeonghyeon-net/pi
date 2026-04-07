import { completeSimple, type Api, type Model } from "@mariozechner/pi-ai";
import { normalizeTitle } from "./title.js";

const TITLE_PROMPT = [
	"You write short session titles for coding work.",
	"Summarize the user's request instead of copying it.",
	"Return only the title, in the user's language, with no quotes.",
	"Keep it specific, under 8 words, and avoid filler words.",
].join(" ");

export type SessionTitleModel = Model<Api>;
export type SessionTitleAuth =
	| { ok: true; apiKey?: string; headers?: Record<string, string> }
	| { ok: false; error: string };

export interface SessionTitleModelRegistry {
	getApiKeyAndHeaders(model: SessionTitleModel): Promise<SessionTitleAuth>;
}

function isTitleableInput(input: string): boolean {
	const raw = input.trim();
	return raw.length > 0 && !raw.startsWith("/") && !raw.startsWith("!");
}

function extractText(content: Array<{ type: string; text?: string }>): string {
	return content
		.filter((part) => part.type === "text" && typeof part.text === "string")
		.map((part) => part.text)
		.join(" ")
		.trim();
}

export async function resolveSessionTitle(
	input: string,
	model: SessionTitleModel | undefined,
	modelRegistry: SessionTitleModelRegistry,
): Promise<string | undefined> {
	if (!isTitleableInput(input) || !model) return undefined;
	const auth = await modelRegistry.getApiKeyAndHeaders(model);
	if (!auth.ok) return undefined;
	try {
		const message = await completeSimple(model, {
			systemPrompt: TITLE_PROMPT,
			messages: [{ role: "user", content: input, timestamp: Date.now() }],
		}, {
			apiKey: auth.apiKey,
			headers: auth.headers,
			maxTokens: 24,
			reasoning: "minimal",
		});
		return normalizeTitle(extractText(message.content));
	} catch {
		return undefined;
	}
}
