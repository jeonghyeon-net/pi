import { buildCompletionNotification, extractAssistantText, type NotificationMessage } from "./format.js";
import { notify } from "./notify.js";
import { resolveKoreanNotificationSummary, type NotificationSummaryModel, type NotificationSummaryModelRegistry } from "./summarize.js";
import { hasKoreanText, sanitizeNotificationText, stripLeadingTitle } from "./text.js";

export const OVERVIEW_REFRESH_QUEUED_EVENT = "auto-session-title:overview-refresh-queued";

const overviewRefreshes = new Map<string, Promise<void>>();
let overviewRefreshListening = false;

interface NotifyContext {
	model: NotificationSummaryModel | undefined;
	modelRegistry: NotificationSummaryModelRegistry;
	sessionManager: { getSessionId(): string; getSessionName(): string | undefined };
}

export function rememberOverviewRefresh(sessionId: string, pending: Promise<void>): void {
	overviewRefreshes.set(sessionId, pending);
	void pending.finally(() => { if (overviewRefreshes.get(sessionId) === pending) overviewRefreshes.delete(sessionId); });
}

export function clearOverviewRefreshState(): void {
	overviewRefreshes.clear();
	overviewRefreshListening = false;
}

export function createSessionStartHandler(events: { on(name: string, handler: (data: unknown) => void): void }) {
	return async () => {
		if (overviewRefreshListening) return;
		overviewRefreshListening = true;
		events.on(OVERVIEW_REFRESH_QUEUED_EVENT, (data) => {
			const { sessionId, pending } = data as { sessionId: string; pending: Promise<void> };
			rememberOverviewRefresh(sessionId, pending);
		});
	};
}

export function createAgentEndHandler(getOverviewRefresh: (sessionId: string) => Promise<void> | undefined = (sessionId) => overviewRefreshes.get(sessionId)) {
	return (event: { messages: NotificationMessage[] }, ctx: NotifyContext): void => {
		void (async () => {
			await getOverviewRefresh(ctx.sessionManager.getSessionId())?.catch(() => undefined);
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
		})();
	};
}
