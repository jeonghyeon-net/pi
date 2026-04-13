import { describe, expect, it } from "vitest";
import { buildFooterOverview, buildFooterOverviewLines, buildFooterStatusEntries } from "../src/build.js";
import { NAME_STATUS_KEY } from "../src/types.js";
import { mockCtx, mockFooterData, mockTheme } from "./helpers.js";

describe("buildFooterStatusEntries", () => {
	it("returns empty when no statuses", () => { expect(buildFooterStatusEntries(mockCtx(), mockFooterData())).toEqual([]); });
	it("does not surface the session name in the footer status list", () => {
		const ctx = mockCtx({ sessionManager: { getCwd: () => "/t", getSessionName: () => "s" } });
		expect(buildFooterStatusEntries(ctx, mockFooterData())).toEqual([]);
	});
	it("sanitizes status text", () => { const fd = mockFooterData({ getExtensionStatuses: () => new Map([["t", "a\t "]]) }); expect(buildFooterStatusEntries(mockCtx(), fd)).toEqual([["t", "a"]]); });
	it("filters reserved key", () => { const fd = mockFooterData({ getExtensionStatuses: () => new Map([[NAME_STATUS_KEY, "x"]]) }); expect(buildFooterStatusEntries(mockCtx(), fd)).toEqual([]); });
	it("filters empty values", () => { const fd = mockFooterData({ getExtensionStatuses: () => new Map([["t", " \t\n "]]) }); expect(buildFooterStatusEntries(mockCtx(), fd)).toEqual([]); });
	it("keeps PR statuses off second line", () => { const entries = buildFooterStatusEntries(mockCtx(), mockFooterData()); expect(entries).not.toContainEqual(["pr-review-approved", "approved"]); });
	it("filters overview statuses from generic footer status list", () => {
		const fd = mockFooterData({ getExtensionStatuses: () => new Map([["auto-session-title.overview.title", "제목"], ["auto-session-title.overview.summary.0", "첫 줄"], ["todo", "doing"]]) });
		expect(buildFooterStatusEntries(mockCtx(), fd)).toEqual([["todo", "doing"]]);
	});
});

describe("buildFooterOverview", () => {
	it("returns undefined when no overview status exists", () => { expect(buildFooterOverview(mockFooterData())).toBeUndefined(); });
	it("builds title and ordered summary lines from status map", () => {
		const fd = mockFooterData({ getExtensionStatuses: () => new Map([["auto-session-title.overview.summary.1", "둘째 줄"], ["auto-session-title.overview.title", "제목"], ["auto-session-title.overview.summary.0", "첫 줄"]]) });
		expect(buildFooterOverview(fd)).toEqual({ title: "제목", summary: ["첫 줄", "둘째 줄"] });
	});
	it("ignores invalid or empty overview summary statuses", () => {
		const fd = mockFooterData({ getExtensionStatuses: () => new Map([["auto-session-title.overview.summary.x", "무시"], ["auto-session-title.overview.summary.2", "  "], ["auto-session-title.overview.summary.0", "첫 줄"]]) });
		expect(buildFooterOverview(fd)).toEqual({ title: undefined, summary: ["첫 줄"] });
	});
	it("hides title-only overview status", () => {
		const fd = mockFooterData({ getExtensionStatuses: () => new Map([["auto-session-title.overview.title", "제목만"]]) });
		expect(buildFooterOverview(fd)).toBeUndefined();
	});
});

describe("buildFooterOverviewLines", () => {
	it("renders title and wraps full summary lines under footer", () => {
		expect(buildFooterOverviewLines(mockTheme(), { title: "세션 제목", summary: ["이 줄은 길어서 푸터 아래에서 여러 줄로 감싸져야 한다"] }, 20)).toEqual([
			" 세션 제목",
			"  • 이 줄은 길어서",
			"    푸터 아래에서",
			"    여러 줄로",
			"    감싸져야 한다",
		]);
	});
	it("renders only title if called with an empty summary directly", () => {
		expect(buildFooterOverviewLines(mockTheme(), { title: "세션 제목", summary: [] }, 20)).toEqual([" 세션 제목"]);
	});
	it("falls back to plain wrapping when width is narrower than bullet prefix", () => {
		expect(buildFooterOverviewLines(mockTheme(), { summary: ["abc"] }, 2)).toEqual(["ab", "c"]);
	});
});
