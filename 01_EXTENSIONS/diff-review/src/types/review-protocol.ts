import type { ReviewSubmitPayload } from "./review-comment.js";
import type { ReviewFile, ReviewFileContents } from "./review-file.js";
import type { ReviewCommitInfo } from "./review-commit.js";
import type { ReviewScope } from "./review-window.js";

export interface ReviewCancelPayload { type: "cancel"; }
export interface ReviewRequestCommitPayload { type: "request-commit"; requestId: string; sha: string; }
export interface ReviewRequestReviewDataPayload { type: "request-review-data"; requestId: string; }
export interface ReviewRequestFilePayload { type: "request-file"; requestId: string; fileId: string; scope: ReviewScope; commitSha?: string | null; }
export type ReviewWindowMessage = ReviewCancelPayload | ReviewRequestCommitPayload | ReviewRequestFilePayload | ReviewRequestReviewDataPayload | ReviewSubmitPayload;
export interface ReviewCommitDataMessage { type: "commit-data"; requestId: string; sha: string; files: ReviewFile[]; }
export interface ReviewCommitErrorMessage { type: "commit-error"; requestId: string; sha: string; message: string; }
export interface ReviewFileDataMessage extends ReviewFileContents { type: "file-data"; requestId: string; fileId: string; scope: ReviewScope; commitSha?: string | null; }
export interface ReviewFileErrorMessage { type: "file-error"; requestId: string; fileId: string; scope: ReviewScope; commitSha?: string | null; message: string; }
export interface ReviewReviewDataMessage { type: "review-data"; requestId: string; files: ReviewFile[]; commits: ReviewCommitInfo[]; branchBaseRef: string | null; branchMergeBaseSha: string | null; repositoryHasHead: boolean; }
export type ReviewHostMessage = ReviewCommitDataMessage | ReviewCommitErrorMessage | ReviewFileDataMessage | ReviewFileErrorMessage | ReviewReviewDataMessage;
