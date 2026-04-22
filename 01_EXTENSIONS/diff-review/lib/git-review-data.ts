import { detectFileKind } from "./git-kinds.js";
import { parseChangedPaths, toComparison } from "./git-parse.js";
import { snapshotNameStatusScript } from "./git-scripts.js";
import { getRepoRoot, hasHead, findReviewBase, listCommits } from "./git-base.js";
import { createWorkingTreeCommit } from "./git-working-tree.js";
import { runBashAllowFailure } from "./git-read.js";
import type { ReviewCommandApi, ReviewCommitInfo, ReviewFile, ReviewWindowData } from "../src/types.js";

function parseCommits(output: string): ReviewCommitInfo[] {
	return output.split(/\r?\n/u).filter(Boolean).map((line) => {
		const [sha, shortSha, subject, authorName, authorDate] = line.split("\u001f");
		return { sha, shortSha, subject, authorName, authorDate, kind: "commit" } satisfies ReviewCommitInfo;
	});
}

function toBranchFile(change: ReturnType<typeof parseChangedPaths>[number]): ReviewFile {
	const path = change.newPath ?? change.oldPath ?? change.displayPath;
	return { id: `branch::${change.displayPath}`, path, worktreeStatus: change.status, hasWorkingTreeFile: change.newPath != null, inGitDiff: true, gitDiff: toComparison(change), ...detectFileKind(path) };
}

async function hasWorkingTreeChanges(pi: Pick<ReviewCommandApi, "exec">, cwd: string): Promise<boolean> {
	const result = await pi.exec("git", ["status", "--porcelain=1", "--untracked-files=all"], { cwd });
	return result.stdout.trim().length > 0;
}

export async function getReviewData(pi: Pick<ReviewCommandApi, "exec">, cwd: string): Promise<ReviewWindowData> {
	const repoRoot = await getRepoRoot(pi, cwd);
	const repositoryHasHead = await hasHead(pi, repoRoot);
	const base = repositoryHasHead ? await findReviewBase(pi, repoRoot) : null;
	const branchMergeBaseSha = base?.mergeBase ?? (repositoryHasHead ? "HEAD" : null);
	const files = parseChangedPaths(await runBashAllowFailure(pi, repoRoot, snapshotNameStatusScript(branchMergeBaseSha))).map(toBranchFile);
	const range = base ? `${base.mergeBase}..HEAD` : repositoryHasHead ? "HEAD" : "";
	const commits = range ? parseCommits(await listCommits(pi, repoRoot, range)) : [];
	return { repoRoot, files, branchBaseRef: base?.baseRef ?? null, branchMergeBaseSha, repositoryHasHead, commits: await hasWorkingTreeChanges(pi, repoRoot) ? [createWorkingTreeCommit(), ...commits] : commits };
}
