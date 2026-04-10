import { describe, expect, it } from "vitest";
import { buildFooterStatusEntries } from "../src/build.js";
import { NAME_STATUS_KEY } from "../src/types.js";
import { mockCtx, mockFooterData } from "./helpers.js";

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
});
