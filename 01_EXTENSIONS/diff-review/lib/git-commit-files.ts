import { getRepoRoot } from "./git-base.js";
import { detectFileKind } from "./git-kinds.js";
import { parseChangedPaths, toComparison } from "./git-parse.js";
import { snapshotNameStatusScript } from "./git-scripts.js";
import { isWorkingTreeCommitSha } from "./git-working-tree.js";
import { runBashAllowFailure } from "./git-read.js";
import type { ReviewCommandApi, ReviewFile } from "../src/types.js";

function toCommitFile(sha: string, change: ReturnType<typeof parseChangedPaths>[number]): ReviewFile {
	const path = change.newPath ?? change.oldPath ?? change.displayPath;
	return { id: `commit::${sha}::${change.displayPath}`, path, worktreeStatus: null, hasWorkingTreeFile: change.newPath != null, inGitDiff: true, gitDiff: toComparison(change), ...detectFileKind(path) };
}

export async function getCommitFiles(pi: Pick<ReviewCommandApi, "exec">, cwd: string, sha: string): Promise<ReviewFile[]> {
	const repoRoot = await getRepoRoot(pi, cwd);
	const output = isWorkingTreeCommitSha(sha)
		? await runBashAllowFailure(pi, repoRoot, snapshotNameStatusScript("HEAD"))
		: await runBashAllowFailure(pi, repoRoot, `git show --format= --find-renames -M --name-status ${JSON.stringify(sha)} --`);
	return parseChangedPaths(output).map((change) => toCommitFile(sha, change));
}
