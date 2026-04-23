import { completeSimple } from "@mariozechner/pi-ai";
import { buildFallbackTitle } from "./fallback-title.js";
import { buildFallbackSourceFromContext, type SessionTitleContext } from "./title-context.js";
import {
	TITLE_SYSTEM_PROMPT,
	buildContextTitlePrompt,
	buildTitlePrompt,
	extractTextContent,
	isClearSummaryTitle,
	looksLikePromptCopy,
	normalizeTitle,
} from "./title-format.js";

type TitleModel = Parameters<typeof completeSimple>[0];
type TitleAuth = { ok: boolean; apiKey?: string; headers?: Record<string, string> };
export type TitleGenerationInput = string | SessionTitleContext;

export type TitleGeneratorContext = {
	model?: TitleModel;
	modelRegistry?: { getApiKeyAndHeaders: (model: TitleModel) => Promise<TitleAuth> };
};

function buildFallbackTitleFromInput(input: TitleGenerationInput): string {
	return buildFallbackTitle(typeof input === "string" ? input : buildFallbackSourceFromContext(input));
}

function buildModelPrompt(input: TitleGenerationInput): string {
	return typeof input === "string" ? buildTitlePrompt(input) : buildContextTitlePrompt(input);
}

function looksLikeInputCopy(title: string, input: TitleGenerationInput): boolean {
	if (typeof input === "string") return looksLikePromptCopy(title, input);
	return [input.firstUserPrompt, ...input.recentUserPrompts].filter(Boolean).some((prompt) => looksLikePromptCopy(title, prompt));
}

export async function generateSessionTitle(ctx: TitleGeneratorContext, input: TitleGenerationInput): Promise<string> {
	const fallbackTitle = buildFallbackTitleFromInput(input);
	if (!ctx.model || !ctx.modelRegistry) return fallbackTitle;
	const auth = await ctx.modelRegistry.getApiKeyAndHeaders(ctx.model).catch(() => undefined);
	if (!auth?.ok) return fallbackTitle;
	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), 10000);
	const result = await completeSimple(
		ctx.model,
		{ systemPrompt: TITLE_SYSTEM_PROMPT, messages: [{ role: "user", content: [{ type: "text", text: buildModelPrompt(input) }], timestamp: Date.now() }] },
		{ apiKey: auth.apiKey, headers: auth.headers, signal: controller.signal, reasoning: "minimal", maxTokens: 80 },
	).catch(() => undefined);
	clearTimeout(timeoutId);
	if (!result || result.stopReason !== "stop") return fallbackTitle;
	const generatedTitle = normalizeTitle(extractTextContent(result.content));
	return isClearSummaryTitle(generatedTitle) && !looksLikeInputCopy(generatedTitle, input) ? generatedTitle : fallbackTitle;
}
