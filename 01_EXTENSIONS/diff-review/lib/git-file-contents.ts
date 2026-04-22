import { getCommitParent } from "./git-base.js";
import { isWorkingTreeCommitSha } from "./git-working-tree.js";
import { readRevision, readWorkingTree } from "./git-read.js";
import type { ReviewCommandApi, ReviewFile, ReviewFileContents, ReviewScope } from "../src/types.js";

function blank(file: ReviewFile, originalExists: boolean, modifiedExists: boolean, originalContent: string, modifiedContent: string): ReviewFileContents {
	return { kind: file.kind, mimeType: file.mimeType, originalExists, modifiedExists, originalContent, modifiedContent, originalPreviewUrl: null, modifiedPreviewUrl: null };
}

async function loadBranch(repoRoot: string, file: ReviewFile, mergeBase: string | null, pi: Pick<ReviewCommandApi, "exec">): Promise<ReviewFileContents> {
	const diff = file.gitDiff;
	const originalContent = await readRevision(pi, repoRoot, mergeBase, diff?.oldPath ?? null);
	const modifiedContent = file.hasWorkingTreeFile ? await readWorkingTree(repoRoot, diff?.newPath ?? file.path) : "";
	return blank(file, diff?.hasOriginal ?? false, file.hasWorkingTreeFile, originalContent, modifiedContent);
}

async function loadCommit(repoRoot: string, file: ReviewFile, sha: string | null, pi: Pick<ReviewCommandApi, "exec">): Promise<ReviewFileContents> {
	if (isWorkingTreeCommitSha(sha ?? "")) return blank(file, !!file.gitDiff?.oldPath, file.hasWorkingTreeFile, await readRevision(pi, repoRoot, "HEAD", file.gitDiff?.oldPath ?? null), await readWorkingTree(repoRoot, file.gitDiff?.newPath ?? file.path));
	const parent = sha ? await getCommitParent(pi, repoRoot, sha) : null;
	const originalContent = await readRevision(pi, repoRoot, parent, file.gitDiff?.oldPath ?? null);
	const modifiedContent = await readRevision(pi, repoRoot, sha, file.gitDiff?.newPath ?? null);
	return blank(file, file.gitDiff?.hasOriginal ?? false, file.gitDiff?.hasModified ?? false, originalContent, modifiedContent);
}

async function loadAll(repoRoot: string, file: ReviewFile): Promise<ReviewFileContents> {
	const modifiedContent = file.hasWorkingTreeFile ? await readWorkingTree(repoRoot, file.gitDiff?.newPath ?? file.path) : "";
	return blank(file, false, file.hasWorkingTreeFile, "", modifiedContent);
}

export async function loadReviewFileContents(pi: Pick<ReviewCommandApi, "exec">, repoRoot: string, file: ReviewFile, scope: ReviewScope, commitSha: string | null, branchMergeBaseSha: string | null): Promise<ReviewFileContents> {
	if (scope === "branch") return loadBranch(repoRoot, file, branchMergeBaseSha, pi);
	if (scope === "commits") return loadCommit(repoRoot, file, commitSha, pi);
	return loadAll(repoRoot, file);
}
