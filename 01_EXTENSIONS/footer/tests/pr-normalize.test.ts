import { describe, expect, it } from "vitest";
import { normalizeMergeState, normalizePullRequest, normalizeReviewState, samePullRequestStatus } from "../src/pr.js";

describe("PR normalization", () => {
	it("maps review decisions", () => { expect(normalizeReviewState("APPROVED")).toBe("approved"); expect(normalizeReviewState("CHANGES_REQUESTED")).toBe("changes-requested"); expect(normalizeReviewState("REVIEW_REQUIRED")).toBe("review-required"); expect(normalizeReviewState(null)).toBe("pending"); });
	it("maps merge states", () => {
		for (const [state, expected] of [["CLEAN", "mergeable"], ["BLOCKED", "blocked"], ["BEHIND", "blocked"], ["HAS_HOOKS", "blocked"], ["UNSTABLE", "blocked"], ["DIRTY", "conflicting"], ["DRAFT", "draft"], ["UNKNOWN", "checking"]] as const) expect(normalizeMergeState(state, "MERGEABLE")).toBe(expected);
		expect(normalizeMergeState(undefined, "MERGEABLE")).toBe("mergeable"); expect(normalizeMergeState(undefined, "CONFLICTING")).toBe("conflicting"); expect(normalizeMergeState(undefined, "UNKNOWN")).toBe("checking"); expect(normalizeMergeState(undefined, undefined)).toBe("blocked");
	});
	it("normalizes draft PR", () => { expect(normalizePullRequest({ isDraft: true, reviewDecision: "APPROVED", mergeStateStatus: "CLEAN" })).toEqual({ exists: true, review: "draft", merge: "draft", number: undefined, title: undefined, url: undefined }); });
	it("normalizes regular PR", () => { expect(normalizePullRequest({ isDraft: false, reviewDecision: "APPROVED", mergeStateStatus: "CLEAN", number: 42, title: "Add footer PR status", url: "https://example.com/pr/42" })).toEqual({ exists: true, review: "approved", merge: "mergeable", number: 42, title: "Add footer PR status", url: "https://example.com/pr/42" }); });
	it("compares PR states", () => { const same = { exists: true, review: "approved" as const, merge: "mergeable" as const, number: 1 }; expect(samePullRequestStatus(same, same)).toBe(true); expect(samePullRequestStatus(same, { ...same })).toBe(true); expect(samePullRequestStatus(same, { ...same, review: "pending" })).toBe(false); expect(samePullRequestStatus(same, null)).toBe(false); });
});
