import { describe, expect, it } from "vitest";
import { findReviewBase, getCommitParent, getRepoRoot, hasHead, listCommits } from "../src/git-base.ts";

function createApi(stdoutByCommand: Record<string, { code: number; stdout: string }>) {
	return { exec: async (command: string, args: string[]) => { const result = stdoutByCommand[[command, ...args].join(" ")]; return result ? { ...result, stderr: "" } : { code: 1, stdout: "", stderr: "" }; } };
}

describe("git base helpers", () => {
	it("resolves repo metadata", async () => {
		const api = createApi({ "git rev-parse --show-toplevel": { code: 0, stdout: "/repo\n" }, "git rev-parse --verify HEAD": { code: 0, stdout: "head\n" }, "git rev-parse sha^": { code: 0, stdout: "parent\n" }, "git log -100 --format=%H%x1f%h%x1f%s%x1f%an%x1f%aI HEAD": { code: 0, stdout: "out\n" } });
		await expect(getRepoRoot(api, "/repo")).resolves.toBe("/repo");
		await expect(hasHead(api, "/repo")).resolves.toBe(true);
		await expect(getCommitParent(api, "/repo", "sha")).resolves.toBe("parent");
		await expect(listCommits(api, "/repo", "HEAD")).resolves.toBe("out\n");
	});

	it("finds merge bases and handles missing repos", async () => {
		const api = createApi({ "git branch --show-current": { code: 0, stdout: "feature\n" }, "git rev-parse --abbrev-ref --symbolic-full-name @{upstream}": { code: 0, stdout: "origin/feature\n" }, "git symbolic-ref refs/remotes/origin/HEAD --short": { code: 0, stdout: "origin/main\n" }, "git merge-base HEAD origin/main": { code: 0, stdout: "abc123\n" } });
		await expect(findReviewBase(api, "/repo")).resolves.toEqual({ baseRef: "origin/main", mergeBase: "abc123" });
		await expect(getRepoRoot(createApi({}), "/repo")).rejects.toThrow("Not inside a git repository.");
	});

	it("returns null when no review base exists", async () => {
		await expect(findReviewBase(createApi({ "git branch --show-current": { code: 0, stdout: "HEAD\n" } }), "/repo")).resolves.toBeNull();
		await expect(hasHead(createApi({}), "/repo")).resolves.toBe(false);
	});
});
