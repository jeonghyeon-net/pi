import { describe, expect, it } from "vitest";
import { buildPullRequestStatusEntries } from "../src/pr.js";

describe("PR display entries", () => {
	it("builds review + merge entries", () => { expect(buildPullRequestStatusEntries({ exists: true, review: "review-required", merge: "blocked" })).toEqual([["pr-review-required", "• review required"], ["pr-merge-blocked", "blocked"]]); });
	it("builds no-pr entry", () => { expect(buildPullRequestStatusEntries({ exists: false, merge: "no-pr" })).toEqual([["pr-no-pr", "no PR"]]); });
	it("handles PR state without review decision", () => { expect(buildPullRequestStatusEntries({ exists: true, merge: "checking" })).toEqual([["pr-merge-checking", "checking"]]); });
	it("returns empty entries for null state", () => { expect(buildPullRequestStatusEntries(null)).toEqual([]); });
});
