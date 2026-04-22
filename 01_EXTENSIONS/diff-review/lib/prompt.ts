import { formatCommentLocation } from "./prompt-location.js";
import type { ReviewFile, ReviewSubmitPayload } from "../src/types.js";

export function hasReviewFeedback(payload: ReviewSubmitPayload): boolean {
	return payload.overallComment.trim().length > 0 || payload.comments.some((comment) => comment.body.trim().length > 0);
}

export function composeReviewPrompt(files: ReviewFile[], payload: ReviewSubmitPayload): string {
	const fileMap = new Map(files.map((file) => [file.id, file]));
	const lines = ["Please address the following feedback", ""];
	const overall = payload.overallComment.trim();
	if (overall) lines.push(overall, "");
	payload.comments.forEach((comment, index) => {
		lines.push(`${index + 1}. ${formatCommentLocation(comment, fileMap.get(comment.fileId))}`);
		lines.push(`   ${comment.body.trim()}`);
		lines.push("");
	});
	return lines.join("\n").trim();
}
