import { buildCompletionNotification, extractAssistantText, type NotificationMessage } from "./format.js";
import { notify } from "./notify.js";
import { resolveKoreanNotificationSummary, type NotificationSummaryModel, type NotificationSummaryModelRegistry } from "./summarize.js";
import { hasKoreanText, sanitizeNotificationText, stripLeadingTitle } from "./text.js";

interface NotifyContext {
	model: NotificationSummaryModel | undefined;
	modelRegistry: NotificationSummaryModelRegistry;
	sessionManager: { getSessionName(): string | undefined };
}

export function createAgentEndHandler() {
	return async (event: { messages: NotificationMessage[] }, ctx: NotifyContext): Promise<void> => {
		const sessionTitle = sanitizeNotificationText(ctx.sessionManager.getSessionName() || "");
		const fallback = buildCompletionNotification(sessionTitle, event.messages);
		const koreanBody = await resolveKoreanNotificationSummary(
			extractAssistantText(event.messages),
			sessionTitle,
			ctx.model,
			ctx.modelRegistry,
		);
		const body = stripLeadingTitle(koreanBody || "", fallback.title);
		notify(fallback.title, body && hasKoreanText(body) ? body : fallback.body);
	};
}
