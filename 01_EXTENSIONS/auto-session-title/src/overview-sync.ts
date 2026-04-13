import { buildConversationTranscript, resolveSessionOverview } from "./summarize.js";
import { OVERVIEW_CUSTOM_TYPE } from "./overview-constants.js";
import { buildTerminalTitle } from "./title.js";
import { findLatestOverview, getEntriesSince } from "./overview-entry.js";
import { clearOverviewDisplay, syncOverviewUi } from "./overview-ui.js";
import type { OverviewContext, OverviewEntry, OverviewRuntime, PersistedOverview, SessionOverview, StoredOverview } from "./overview-types.js";

const rerunRequested = new Set<string>();

function sameSummary(left: readonly string[], right: readonly string[]): boolean {
	return left.length === right.length && left.every((line, index) => line === right[index]);
}

function resolveFallbackTitle(previous: PersistedOverview | undefined, runtime: OverviewRuntime, ctx: OverviewContext): string | undefined {
	return previous?.title || runtime.getSessionName() || ctx.sessionManager.getSessionName();
}

function getRecentEntries(branch: OverviewEntry[], previous?: PersistedOverview): OverviewEntry[] {
	if (!previous) return branch;
	const sinceCovered = getEntriesSince(branch, previous.coveredThroughEntryId);
	return sinceCovered === branch ? getEntriesSince(branch, previous.entryId) : sinceCovered;
}

function isActive(runtime: OverviewRuntime): boolean {
	return runtime.isActive?.() ?? true;
}

function syncTerminalTitle(ctx: OverviewContext, title?: string): void {
	if (ctx.hasUI) ctx.ui.setTitle(buildTerminalTitle(title));
}

function toStoredOverview(overview: SessionOverview, coveredThroughEntryId?: string): StoredOverview {
	return { title: overview.title, summary: overview.summary, coveredThroughEntryId };
}

function shouldPersist(previous: PersistedOverview | undefined, next: SessionOverview, coveredThroughEntryId?: string): boolean {
	return !previous || previous.title !== next.title || !sameSummary(previous.summary, next.summary) || Boolean(coveredThroughEntryId && previous.coveredThroughEntryId !== coveredThroughEntryId);
}

export function restoreOverview(runtime: OverviewRuntime, ctx: OverviewContext): void {
	if (!isActive(runtime)) return;
	const overview = findLatestOverview(ctx.sessionManager.getBranch());
	if (overview && runtime.getSessionName() !== overview.title) runtime.setSessionName(overview.title);
	const title = resolveFallbackTitle(overview, runtime, ctx);
	if (!overview && !title) {
		clearOverviewDisplay(ctx);
		syncTerminalTitle(ctx);
		return;
	}
	syncOverviewUi(ctx, overview, title);
	syncTerminalTitle(ctx, title);
}

export async function refreshOverview(inFlight: Set<string>, runtime: OverviewRuntime, ctx: OverviewContext): Promise<void> {
	const sessionId = ctx.sessionManager.getSessionId();
	if (inFlight.has(sessionId)) {
		rerunRequested.add(sessionId);
		return;
	}
	inFlight.add(sessionId);
	try {
		const branch = ctx.sessionManager.getBranch();
		const previous = findLatestOverview(branch);
		const recentEntries = getRecentEntries(branch, previous);
		if (recentEntries.length === 0) return restoreOverview(runtime, ctx);
		const coveredThroughEntryId = recentEntries.at(-1)?.id;
		const recentText = buildConversationTranscript(recentEntries);
		if (!recentText) {
			if (isActive(runtime) && previous && coveredThroughEntryId && previous.coveredThroughEntryId !== coveredThroughEntryId) runtime.appendEntry(OVERVIEW_CUSTOM_TYPE, toStoredOverview(previous, coveredThroughEntryId));
			return restoreOverview(runtime, ctx);
		}
		const next = await resolveSessionOverview({ recentText, previous, model: ctx.model, modelRegistry: ctx.modelRegistry });
		if (!isActive(runtime)) return;
		if (!next) return restoreOverview(runtime, ctx);
		if (next.summary.length === 0) {
			if (previous) return restoreOverview(runtime, ctx);
			clearOverviewDisplay(ctx);
			return syncTerminalTitle(ctx);
		}
		if (shouldPersist(previous, next, coveredThroughEntryId)) runtime.appendEntry(OVERVIEW_CUSTOM_TYPE, toStoredOverview(next, coveredThroughEntryId));
		if (runtime.getSessionName() !== next.title) runtime.setSessionName(next.title);
		syncOverviewUi(ctx, next, next.title);
		syncTerminalTitle(ctx, next.title);
	} finally {
		inFlight.delete(sessionId);
		if (rerunRequested.delete(sessionId) && isActive(runtime)) await refreshOverview(inFlight, runtime, ctx);
	}
}

export function clearOverviewUi(inFlight: Set<string>, ctx?: OverviewContext): void {
	inFlight.clear();
	rerunRequested.clear();
	clearOverviewDisplay(ctx);
}
