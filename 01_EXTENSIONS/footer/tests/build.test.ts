import { describe, it, expect } from "vitest";
import { buildFooterStatusEntries, buildFooterLineParts } from "../src/build.js";
import { NAME_STATUS_KEY } from "../src/types.js";
import { mockTheme, mockFooterData, mockCtx } from "./helpers.js";

describe("buildFooterStatusEntries", () => {
	it("returns empty when no statuses", () => { expect(buildFooterStatusEntries(mockCtx(), mockFooterData())).toEqual([]); });
	it("prepends session name", () => {
		const ctx = mockCtx({ sessionManager: { getCwd: () => "/t", getSessionName: () => "s" } });
		expect(buildFooterStatusEntries(ctx, mockFooterData())).toEqual([[NAME_STATUS_KEY, "s"]]);
	});
	it("sanitizes status text", () => {
		const fd = mockFooterData({ getExtensionStatuses: () => new Map([["t", "a\t "]]) });
		expect(buildFooterStatusEntries(mockCtx(), fd)).toEqual([["t", "a"]]);
	});
	it("filters NAME_STATUS_KEY from statuses", () => {
		const fd = mockFooterData({ getExtensionStatuses: () => new Map([[NAME_STATUS_KEY, "x"]]) });
		expect(buildFooterStatusEntries(mockCtx(), fd)).toEqual([]);
	});
	it("filters empty text after sanitization", () => {
		const fd = mockFooterData({ getExtensionStatuses: () => new Map([["t", " \t\n "]]) });
		expect(buildFooterStatusEntries(mockCtx(), fd)).toEqual([]);
	});
});

describe("buildFooterLineParts", () => {
	const t = mockTheme();
	it("shows model and branch", () => {
		const { left } = buildFooterLineParts(t, mockCtx(), mockFooterData(), null, false, 120);
		expect(left).toContain("claude-opus-4-6");
		expect(left).toContain("main");
	});
	it("uses repo name", () => { expect(buildFooterLineParts(t, mockCtx(), mockFooterData(), "r", false, 120).left).toContain("r"); });
	it("falls back to folder name", () => { expect(buildFooterLineParts(t, mockCtx(), mockFooterData(), null, false, 120).left).toContain("project"); });
	it("shows dirty mark", () => { expect(buildFooterLineParts(t, mockCtx(), mockFooterData(), null, true, 120).left).toContain("*"); });
	it("no dirty mark when no branch", () => {
		const { left } = buildFooterLineParts(t, mockCtx(), mockFooterData({ getGitBranch: () => null }), null, true, 120);
		expect(left).not.toContain("*");
		expect(left).toContain("no-branch");
	});
	it("shows no-model when undefined", () => { expect(buildFooterLineParts(t, mockCtx({ model: undefined }), mockFooterData(), null, false, 120).left).toContain("no-model"); });
	it("bar at 50%", () => {
		const { right } = buildFooterLineParts(t, mockCtx({ getContextUsage: () => ({ percent: 50 }) }), mockFooterData(), null, false, 120);
		expect(right).toContain("50%");
		expect(right).toContain("#####-----");
	});
	it("bar at 0%", () => { expect(buildFooterLineParts(t, mockCtx({ getContextUsage: () => ({ percent: 0 }) }), mockFooterData(), null, false, 120).right).toContain("----------"); });
	it("bar at 100%", () => { expect(buildFooterLineParts(t, mockCtx({ getContextUsage: () => ({ percent: 100 }) }), mockFooterData(), null, false, 120).right).toContain("##########"); });
	it("null context usage", () => { expect(buildFooterLineParts(t, mockCtx({ getContextUsage: () => undefined }), mockFooterData(), null, false, 120).right).toContain("0%"); });
	it("null percent treated as 0%", () => { expect(buildFooterLineParts(t, mockCtx({ getContextUsage: () => ({ percent: null }) }), mockFooterData(), null, false, 120).right).toContain("0%"); });
	it("researching mid", () => {
		const fd = mockFooterData({ getExtensionStatuses: () => new Map([["a", "researching"]]) });
		expect(buildFooterLineParts(t, mockCtx(), fd, null, false, 120).mid).toContain("researching");
	});
	it("done mid", () => {
		const fd = mockFooterData({ getExtensionStatuses: () => new Map([["a", "done"]]) });
		expect(buildFooterLineParts(t, mockCtx(), fd, null, false, 120).mid).toContain("done");
	});
	it("researching over done", () => {
		const fd = mockFooterData({ getExtensionStatuses: () => new Map([["a", "researching"], ["b", "done"]]) });
		const { mid } = buildFooterLineParts(t, mockCtx(), fd, null, false, 120);
		expect(mid).toContain("researching");
		expect(mid).not.toContain("done");
	});
	it("error color at 90%", () => { expect(buildFooterLineParts(t, mockCtx({ getContextUsage: () => ({ percent: 90 }) }), mockFooterData(), null, false, 120).right).toContain("90%"); });
	it("warning color at 70%", () => { expect(buildFooterLineParts(t, mockCtx({ getContextUsage: () => ({ percent: 70 }) }), mockFooterData(), null, false, 120).right).toContain("70%"); });
});
