import { describe, expect, it } from "vitest";
import { buildFooterLineParts } from "../src/build.js";
import { mockCtx, mockFooterData, mockTheme } from "./helpers.js";

const t = mockTheme();

describe("buildFooterLineParts", () => {
	it("shows model and branch", () => { const { left } = buildFooterLineParts(t, mockCtx(), mockFooterData(), null, false, null, 120); expect(left).toContain("claude-opus-4-6"); expect(left).toContain("main"); });
	it("uses repo name", () => { expect(buildFooterLineParts(t, mockCtx(), mockFooterData(), "r", false, null, 120).left).toContain("r"); });
	it("falls back to folder name", () => { expect(buildFooterLineParts(t, mockCtx(), mockFooterData(), null, false, null, 120).left).toContain("project"); });
	it("shows dirty mark", () => { expect(buildFooterLineParts(t, mockCtx(), mockFooterData(), null, true, null, 120).left).toContain("*"); });
	it("handles no branch", () => { const { left } = buildFooterLineParts(t, mockCtx(), mockFooterData({ getGitBranch: () => null }), null, true, null, 120); expect(left).not.toContain("*"); expect(left).toContain("no-branch"); });
	it("shows no-model when undefined", () => { expect(buildFooterLineParts(t, mockCtx({ model: undefined }), mockFooterData(), null, false, null, 120).left).toContain("no-model"); });
	it("renders usage bar variants", () => { expect(buildFooterLineParts(t, mockCtx({ getContextUsage: () => ({ percent: 50 }) }), mockFooterData(), null, false, null, 120).right).toContain("#####-----"); expect(buildFooterLineParts(t, mockCtx({ getContextUsage: () => ({ percent: 0 }) }), mockFooterData(), null, false, null, 120).right).toContain("----------"); expect(buildFooterLineParts(t, mockCtx({ getContextUsage: () => ({ percent: 100 }) }), mockFooterData(), null, false, null, 120).right).toContain("##########"); });
	it("handles missing usage", () => { expect(buildFooterLineParts(t, mockCtx({ getContextUsage: () => undefined }), mockFooterData(), null, false, null, 120).right).toContain("0%"); expect(buildFooterLineParts(t, mockCtx({ getContextUsage: () => ({ percent: null }) }), mockFooterData(), null, false, null, 120).right).toContain("0%"); });
	it("summarizes research and done states", () => { const r = mockFooterData({ getExtensionStatuses: () => new Map([["a", "researching"]]) }); const d = mockFooterData({ getExtensionStatuses: () => new Map([["a", "done"]]) }); const both = mockFooterData({ getExtensionStatuses: () => new Map([["a", "researching"], ["b", "done"]]) }); expect(buildFooterLineParts(t, mockCtx(), r, null, false, null, 120).mid).toContain("researching"); expect(buildFooterLineParts(t, mockCtx(), d, null, false, null, 120).mid).toContain("done"); expect(buildFooterLineParts(t, mockCtx(), both, null, false, null, 120).mid).toContain("researching"); });
	it("keeps right side percentages", () => { expect(buildFooterLineParts(t, mockCtx({ getContextUsage: () => ({ percent: 90 }) }), mockFooterData(), null, false, null, 120).right).toContain("90%"); expect(buildFooterLineParts(t, mockCtx({ getContextUsage: () => ({ percent: 70 }) }), mockFooterData(), null, false, null, 120).right).toContain("70%"); });
	it("shows PR status after branch", () => { const { left, statusEntries } = buildFooterLineParts(t, mockCtx(), mockFooterData(), null, false, { exists: true, review: "approved", merge: "mergeable" }, 120); expect(left).toContain("main · ✓ approved · mergeable"); expect(statusEntries).not.toContainEqual(["pr-review-approved", "approved"]); });
	it("shows no PR state on first line", () => { const { left } = buildFooterLineParts(t, mockCtx(), mockFooterData(), null, false, { exists: false, merge: "no-pr" }, 120); expect(left).toContain("main · no PR"); });
});
