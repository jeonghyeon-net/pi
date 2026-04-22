import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadReviewFileContents } from "../src/git-detail.ts";
import type { ReviewFile } from "../src/types.ts";

const file = { id: "f1", path: "src.ts", worktreeStatus: "modified", hasWorkingTreeFile: true, inGitDiff: true, gitDiff: { status: "modified", oldPath: "src.ts", newPath: "src.ts", displayPath: "src.ts", hasOriginal: true, hasModified: true }, kind: "text", mimeType: null } satisfies ReviewFile;

describe("loadReviewFileContents", () => {
	it("loads branch, commit, and all-file contents", async () => {
		const repoRoot = String(await mkdir(join(tmpdir(), `pi-diff-${Date.now()}`), { recursive: true }));
		await writeFile(join(repoRoot, "src.ts"), "live\n");
		const api = { exec: async (command: string, args: string[]) => ({ code: 0, stdout: command === "git" && args[0] === "rev-parse" ? "parent\n" : args.join(" ").includes("show") ? "git\n" : "", stderr: "" }) };
		await expect(loadReviewFileContents(api, repoRoot, file, "branch", null, "base123")).resolves.toMatchObject({ originalContent: "git\n", modifiedContent: "live\n" });
		await expect(loadReviewFileContents(api, repoRoot, file, "commits", "sha1", "base123")).resolves.toMatchObject({ originalContent: "git\n", modifiedContent: "git\n" });
		await expect(loadReviewFileContents(api, repoRoot, file, "all", null, "base123")).resolves.toMatchObject({ originalContent: "", modifiedContent: "live\n" });
	});

	it("handles deleted files and working-tree pseudo commits", async () => {
		const repoRoot = String(await mkdir(join(tmpdir(), `pi-diff-${Date.now()}-2`), { recursive: true }));
		const deleted = { ...file, hasWorkingTreeFile: false, gitDiff: { ...file.gitDiff, status: "deleted", newPath: null, hasModified: false } } satisfies ReviewFile;
		const api = { exec: async () => ({ code: 0, stdout: "git\n", stderr: "" }) };
		await expect(loadReviewFileContents(api, repoRoot, deleted, "commits", "__pi_working_tree__", null)).resolves.toMatchObject({ modifiedContent: "", modifiedExists: false });
	});
});
