import type { DiffReviewComment, ReviewFile } from "../src/types.js";

function scopeLabel(comment: DiffReviewComment): string {
	if (comment.scope === "branch") return "branch diff";
	if (comment.scope === "all") return "all files";
	if (comment.commitKind === "working-tree") return "working tree changes";
	return comment.commitShort ? `commit ${comment.commitShort}` : "commit";
}

function pathLabel(file: ReviewFile | undefined): string {
	return file?.gitDiff?.displayPath ?? file?.path ?? "(unknown file)";
}

export function formatCommentLocation(comment: DiffReviewComment, file: ReviewFile | undefined): string {
	const prefix = `[${scopeLabel(comment)}] ${pathLabel(file)}`;
	if (comment.side === "file" || comment.startLine == null) return prefix;
	const range = comment.endLine && comment.endLine !== comment.startLine ? `${comment.startLine}-${comment.endLine}` : String(comment.startLine);
	const suffix = comment.scope === "all" ? "" : comment.side === "original" ? " (old)" : " (new)";
	return `${prefix}:${range}${suffix}`;
}
