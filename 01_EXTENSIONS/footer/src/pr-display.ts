import type { FooterStatusEntry, PullRequestMergeState, PullRequestReviewState, PullRequestStatus } from "./types.js";
import { PR_STATUS_KEYS } from "./types.js";

const REVIEW_ENTRY_MAP: Record<PullRequestReviewState, FooterStatusEntry> = {
	approved: [PR_STATUS_KEYS.reviewApproved, "✓ approved"],
	"changes-requested": [PR_STATUS_KEYS.reviewChangesRequested, "× changes requested"],
	"review-required": [PR_STATUS_KEYS.reviewRequired, "• review required"],
	pending: [PR_STATUS_KEYS.reviewPending, "… review pending"],
	draft: [PR_STATUS_KEYS.reviewDraft, "· draft"],
};

const MERGE_ENTRY_MAP: Record<PullRequestMergeState, FooterStatusEntry> = {
	mergeable: [PR_STATUS_KEYS.mergeMergeable, "mergeable"], blocked: [PR_STATUS_KEYS.mergeBlocked, "blocked"],
	conflicting: [PR_STATUS_KEYS.mergeConflicting, "conflicts"], checking: [PR_STATUS_KEYS.mergeChecking, "checking"],
	draft: [PR_STATUS_KEYS.mergeDraft, "draft"], "no-pr": [PR_STATUS_KEYS.noPullRequest, "no PR"],
};

export function buildPullRequestStatusEntries(pr: PullRequestStatus | null): FooterStatusEntry[] {
	if (!pr) return [];
	if (!pr.exists) return [MERGE_ENTRY_MAP["no-pr"]];
	return [...(pr.review ? [REVIEW_ENTRY_MAP[pr.review]] : []), MERGE_ENTRY_MAP[pr.merge]];
}
