import { describe, expect, it } from "vitest";
import { getPullRequestStatus } from "../src/pr.js";
import { mockExec } from "./helpers.js";

describe("PR query", () => {
	it("returns null when branch is missing", async () => { await expect(getPullRequestStatus("/repo", null, mockExec())).resolves.toBeNull(); });
	it("fetches current branch pull request status", async () => {
		const exec = mockExec({ code: 0, stdout: JSON.stringify([{ reviewDecision: "APPROVED", mergeStateStatus: "CLEAN", number: 42, title: "Add footer PR status", url: "https://example.com/pr/42" }]) });
		await expect(getPullRequestStatus("/repo", "feature/x", exec)).resolves.toEqual({ exists: true, review: "approved", merge: "mergeable", number: 42, title: "Add footer PR status", url: "https://example.com/pr/42" });
		expect(exec).toHaveBeenCalledWith("gh", ["pr", "list", "--head", "feature/x", "--state", "open", "--json", "number,title,url,isDraft,reviewDecision,mergeable,mergeStateStatus", "--limit", "1"], { cwd: "/repo" });
	});
	it("handles empty, invalid, and failed responses", async () => {
		await expect(getPullRequestStatus("/repo", "feature/x", mockExec({ code: 0, stdout: "[]" }))).resolves.toEqual({ exists: false, merge: "no-pr" });
		await expect(getPullRequestStatus("/repo", "feature/x", mockExec({ code: 0, stdout: "{}" }))).resolves.toBeNull();
		await expect(getPullRequestStatus("/repo", "feature/x", mockExec({ code: 0, stdout: "{" }))).resolves.toBeNull();
		await expect(getPullRequestStatus("/repo", "feature/x", mockExec({ code: 0, stdout: "" }))).resolves.toBeNull();
		await expect(getPullRequestStatus("/repo", "feature/x", mockExec({ code: 1, stdout: "" }))).resolves.toBeNull();
	});
});
