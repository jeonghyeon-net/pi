import type { ReviewCommitKind } from "./review-commit.js";
import type { CommentSide, ReviewScope } from "./review-window.js";

export interface DiffReviewComment {
	id: string;
	fileId: string;
	scope: ReviewScope;
	commitSha?: string | null;
	commitShort?: string | null;
	commitKind?: ReviewCommitKind | null;
	side: CommentSide;
	startLine: number | null;
	endLine: number | null;
	body: string;
}

export interface ReviewSubmitPayload {
	type: "submit";
	overallComment: string;
	comments: DiffReviewComment[];
}
