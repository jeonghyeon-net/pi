import { clearOverviewUi, previewOverviewFromInput, refreshOverview, restoreOverview, type OverviewContext, type OverviewRuntime } from "./handlers.js";

const OVERVIEW_REFRESH_QUEUED_EVENT = "auto-session-title:overview-refresh-queued";
const inFlight = new Set<string>();
const pendingRefreshes = new Map<string, Promise<void>>();
let activeSessionId: string | undefined;
let lifecycleId = 0;
let viewId = 0;
let previewViewId = -1;

function beginView(ctx: OverviewContext): void {
	activeSessionId = ctx.sessionManager.getSessionId();
	viewId += 1;
}

function runtime(ctx: OverviewContext, getSessionName: OverviewRuntime["getSessionName"], setSessionName: OverviewRuntime["setSessionName"], appendEntry: OverviewRuntime["appendEntry"]): OverviewRuntime {
	const sessionId = ctx.sessionManager.getSessionId();
	activeSessionId = sessionId;
	const currentLifecycleId = lifecycleId;
	const currentViewId = viewId;
	return { getSessionName, setSessionName, appendEntry, isActive: () => activeSessionId === sessionId && lifecycleId === currentLifecycleId && viewId === currentViewId };
}

function queueRefresh(getSessionName: OverviewRuntime["getSessionName"], setSessionName: OverviewRuntime["setSessionName"], appendEntry: OverviewRuntime["appendEntry"], ctx: OverviewContext): Promise<void> {
	const sessionId = ctx.sessionManager.getSessionId();
	const pending = pendingRefreshes.get(sessionId);
	if (pending) {
		void refreshOverview(inFlight, runtime(ctx, getSessionName, setSessionName, appendEntry), ctx).catch(() => undefined);
		return pending;
	}
	const next = refreshOverview(inFlight, runtime(ctx, getSessionName, setSessionName, appendEntry), ctx)
		.catch(() => undefined)
		.finally(() => { if (pendingRefreshes.get(sessionId) === next) pendingRefreshes.delete(sessionId); });
	pendingRefreshes.set(sessionId, next);
	return next;
}

export function createInputHandler() {
	return (event: { text: string; source: string }, ctx: OverviewContext) => {
		if (event.source === "interactive" && previewViewId !== viewId && previewOverviewFromInput(ctx, event.text)) previewViewId = viewId;
		return { action: "continue" } as const;
	};
}

export function createSessionStartHandler(getSessionName: OverviewRuntime["getSessionName"], setSessionName: OverviewRuntime["setSessionName"], appendEntry: OverviewRuntime["appendEntry"]) {
	return async (_event: object, ctx: OverviewContext) => {
		beginView(ctx);
		restoreOverview(runtime(ctx, getSessionName, setSessionName, appendEntry), ctx);
	};
}

export function createTurnEndHandler(getSessionName: OverviewRuntime["getSessionName"], setSessionName: OverviewRuntime["setSessionName"], appendEntry: OverviewRuntime["appendEntry"]) {
	return (_event: object, ctx: OverviewContext) => { if (ctx.hasPendingMessages?.()) queueRefresh(getSessionName, setSessionName, appendEntry, ctx); };
}

export function createAgentEndHandler(
	getSessionName: OverviewRuntime["getSessionName"],
	setSessionName: OverviewRuntime["setSessionName"],
	appendEntry: OverviewRuntime["appendEntry"],
	events?: { emit(name: string, data: unknown): void },
) {
	return (_event: object, ctx: OverviewContext) => {
		const pending = queueRefresh(getSessionName, setSessionName, appendEntry, ctx);
		events?.emit(OVERVIEW_REFRESH_QUEUED_EVENT, { sessionId: ctx.sessionManager.getSessionId(), pending });
	};
}

export function createSessionTreeHandler(getSessionName: OverviewRuntime["getSessionName"], setSessionName: OverviewRuntime["setSessionName"], appendEntry: OverviewRuntime["appendEntry"]) {
	return async (_event: object, ctx: OverviewContext) => {
		beginView(ctx);
		restoreOverview(runtime(ctx, getSessionName, setSessionName, appendEntry), ctx);
	};
}

export function createSessionShutdownHandler() {
	return async (_event: object, ctx: OverviewContext) => {
		activeSessionId = undefined;
		lifecycleId += 1;
		viewId += 1;
		previewViewId = -1;
		pendingRefreshes.clear();
		clearOverviewUi(inFlight, ctx);
	};
}
