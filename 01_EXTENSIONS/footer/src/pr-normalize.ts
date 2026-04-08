import type { PullRequestMergeState, PullRequestReviewState, PullRequestStatus } from "./types.js";

export interface GitHubPullRequest {
	number?: number; title?: string; url?: string; isDraft?: boolean;
	reviewDecision?: string | null; mergeable?: string | null; mergeStateStatus?: string | null;
}

export function samePullRequestStatus(a: PullRequestStatus | null, b: PullRequestStatus | null): boolean {
	return a === b || (!!a && !!b && a.exists === b.exists && a.review === b.review && a.merge === b.merge
		&& a.number === b.number && a.title === b.title && a.url === b.url);
}

export function normalizePullRequest(pr: GitHubPullRequest): PullRequestStatus {
	const draft = pr.isDraft === true;
	return {
		exists: true,
		review: draft ? "draft" : normalizeReviewState(pr.reviewDecision),
		merge: draft ? "draft" : normalizeMergeState(pr.mergeStateStatus, pr.mergeable),
		number: typeof pr.number === "number" ? pr.number : undefined,
		title: typeof pr.title === "string" ? pr.title : undefined,
		url: typeof pr.url === "string" ? pr.url : undefined,
	};
}

export function normalizeReviewState(reviewDecision: string | null | undefined): PullRequestReviewState {
	if (reviewDecision === "APPROVED") return "approved";
	if (reviewDecision === "CHANGES_REQUESTED") return "changes-requested";
	if (reviewDecision === "REVIEW_REQUIRED") return "review-required";
	return "pending";
}

export function normalizeMergeState(state: string | null | undefined, mergeable: string | null | undefined): PullRequestMergeState {
	if (state === "CLEAN") return "mergeable";
	if (state === "BLOCKED" || state === "BEHIND" || state === "HAS_HOOKS" || state === "UNSTABLE") return "blocked";
	if (state === "DIRTY") return "conflicting";
	if (state === "DRAFT") return "draft";
	if (state === "UNKNOWN") return "checking";
	if (mergeable === "MERGEABLE") return "mergeable";
	if (mergeable === "CONFLICTING") return "conflicting";
	if (mergeable === "UNKNOWN") return "checking";
	return "blocked";
}
