export type ReviewScope = "branch" | "commits" | "all";
export type CommentSide = "original" | "modified" | "file";

import type { ReviewCommitInfo } from "./review-commit.js";
import type { ReviewFile } from "./review-file.js";

export interface ReviewWindowData {
	repoRoot: string;
	files: ReviewFile[];
	commits: ReviewCommitInfo[];
	branchBaseRef: string | null;
	branchMergeBaseSha: string | null;
	repositoryHasHead: boolean;
}
