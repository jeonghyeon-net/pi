import type { ReviewRequestCommitPayload, ReviewRequestFilePayload, ReviewRequestReviewDataPayload, ReviewSubmitPayload } from "../src/types.js";

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function hasType(value: unknown, type: string): value is Record<string, unknown> {
	return isRecord(value) && value.type === type;
}

export function isRequestCommit(value: unknown): value is ReviewRequestCommitPayload {
	return hasType(value, "request-commit") && typeof value.requestId === "string" && typeof value.sha === "string";
}

export function isRequestFile(value: unknown): value is ReviewRequestFilePayload {
	return hasType(value, "request-file") && typeof value.requestId === "string" && typeof value.fileId === "string" && (value.scope === "branch" || value.scope === "commits" || value.scope === "all");
}

export function isRequestReviewData(value: unknown): value is ReviewRequestReviewDataPayload {
	return hasType(value, "request-review-data") && typeof value.requestId === "string";
}

export function isCancel(value: unknown): boolean {
	return hasType(value, "cancel");
}

export function isSubmit(value: unknown): value is ReviewSubmitPayload {
	return hasType(value, "submit") && typeof value.overallComment === "string" && Array.isArray(value.comments);
}
