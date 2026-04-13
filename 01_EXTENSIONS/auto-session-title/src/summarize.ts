import { completeSimple } from "@mariozechner/pi-ai";
import type { SessionOverview } from "./overview-types.js";
import { buildOverviewPrompt } from "./summary-prompt.js";
import { extractAssistantText, parseOverviewResponse } from "./summary-parse.js";
import { OVERVIEW_PROMPT, type ResolveSessionOverviewOptions, type SessionOverviewAuth, type SessionOverviewModel, type SessionOverviewModelRegistry } from "./summary-types.js";
export { buildConversationTranscript, extractSummaryLines } from "./summary-text.js";
export { buildOverviewPrompt } from "./summary-prompt.js";
export { parseOverviewResponse } from "./summary-parse.js";
export { OVERVIEW_PROMPT, type ResolveSessionOverviewOptions, type SessionOverviewAuth, type SessionOverviewModel, type SessionOverviewModelRegistry } from "./summary-types.js";

export async function resolveSessionOverview(options: ResolveSessionOverviewOptions): Promise<SessionOverview | undefined> {
	if (!options.model || !options.recentText.trim()) return undefined;
	const auth = await options.modelRegistry.getApiKeyAndHeaders(options.model);
	if (!auth.ok) return undefined;
	try {
		const message = await completeSimple(
			options.model,
			{ systemPrompt: OVERVIEW_PROMPT, messages: [{ role: "user", content: buildOverviewPrompt(options.recentText, options.previous), timestamp: Date.now() }] },
			{ apiKey: auth.apiKey, headers: auth.headers },
		);
		if (message.stopReason === "error") return undefined;
		return parseOverviewResponse(extractAssistantText(message));
	} catch {
		return undefined;
	}
}
