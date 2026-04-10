import { OVERVIEW_CUSTOM_TYPE } from "./overview-constants.js";
import type { OverviewEntry, PersistedOverview, SessionOverview, StoredOverview } from "./overview-types.js";

function normalizeSummaryLine(line: unknown): string | undefined {
	if (typeof line !== "string") return undefined;
	const collapsed = line.replace(/^[-*•]\s*/, "").replace(/\s+/g, " ").trim();
	return collapsed || undefined;
}

function normalizeOverviewData(data: object | null | undefined): StoredOverview | undefined {
	const record = data && typeof data === "object" ? data as { title?: unknown; summary?: unknown; coveredThroughEntryId?: unknown } : undefined;
	const title = typeof record?.title === "string" ? record.title.trim() : "";
	const coveredThroughEntryId = typeof record?.coveredThroughEntryId === "string" ? record.coveredThroughEntryId.trim() : "";
	const summary = Array.isArray(record?.summary)
		? record.summary.map(normalizeSummaryLine).filter((line): line is string => Boolean(line))
		: [];
	return title && summary.length > 0 ? { title, summary, coveredThroughEntryId: coveredThroughEntryId || undefined } : undefined;
}

export function findLatestOverview(branch: OverviewEntry[]): PersistedOverview | undefined {
	for (let i = branch.length - 1; i >= 0; i--) {
		const entry = branch[i]!;
		if (entry.type !== "custom" || entry.customType !== OVERVIEW_CUSTOM_TYPE) continue;
		const overview = normalizeOverviewData(entry.data);
		if (!overview) continue;
		return { entryId: entry.id, coveredThroughEntryId: overview.coveredThroughEntryId || entry.id, title: overview.title, summary: overview.summary };
	}
}

export function getEntriesSince(branch: OverviewEntry[], checkpointEntryId?: string): OverviewEntry[] {
	if (!checkpointEntryId) return branch;
	const index = branch.findIndex((entry) => entry.id === checkpointEntryId);
	return index < 0 ? branch : branch.slice(index + 1);
}

export function resolveOverviewTitle(overview?: SessionOverview, fallbackTitle?: string): string {
	return overview?.title || fallbackTitle || "세션 요약";
}

export function buildOverviewBodyLines(overview?: SessionOverview): string[] {
	return overview?.summary ?? ["요약이 아직 없습니다.", "다음 응답이 끝나면 자동으로 정리됩니다."];
}

export function buildOverviewWidgetText(overview?: SessionOverview, fallbackTitle?: string): string {
	return [resolveOverviewTitle(overview, fallbackTitle), ...buildOverviewBodyLines(overview)].join("\n");
}
