import type { ReviewCommitInfo } from "../src/types.js";

export const WORKING_TREE_SHA = "__pi_working_tree__";

export function isWorkingTreeCommitSha(sha: string): boolean {
	return sha === WORKING_TREE_SHA;
}

export function createWorkingTreeCommit(): ReviewCommitInfo {
	return { sha: WORKING_TREE_SHA, shortSha: "WT", subject: "Uncommitted changes", authorName: "", authorDate: "", kind: "working-tree" };
}
