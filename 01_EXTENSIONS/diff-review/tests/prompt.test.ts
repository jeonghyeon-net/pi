import { describe, expect, it } from "vitest";
import { composeReviewPrompt, hasReviewFeedback } from "../src/prompt.ts";
import type { ReviewFile } from "../src/types.ts";

const files = [{ id: "f1", path: "src/a.ts", worktreeStatus: "modified", hasWorkingTreeFile: true, inGitDiff: true, gitDiff: { status: "modified", oldPath: "src/a.ts", newPath: "src/a.ts", displayPath: "src/a.ts", hasOriginal: true, hasModified: true }, kind: "text", mimeType: null } satisfies ReviewFile];

describe("review prompt", () => {
	it("detects whether feedback exists", () => {
		expect(hasReviewFeedback({ type: "submit", overallComment: "", comments: [] })).toBe(false);
		expect(hasReviewFeedback({ type: "submit", overallComment: "note", comments: [] })).toBe(true);
	});

	it("formats precise review locations", () => {
		const prompt = composeReviewPrompt(files, { type: "submit", overallComment: "Overall", comments: [{ id: "1", fileId: "f1", scope: "branch", side: "modified", startLine: 3, endLine: 5, body: "branch note" }, { id: "2", fileId: "f1", scope: "commits", commitShort: "abc123", side: "original", startLine: 8, endLine: 8, body: "commit note" }, { id: "3", fileId: "f1", scope: "all", side: "file", startLine: null, endLine: null, body: "file note" }] });
		expect(prompt).toContain("[branch diff] src/a.ts:3-5 (new)");
		expect(prompt).toContain("[commit abc123] src/a.ts:8 (old)");
		expect(prompt).toContain("[all files] src/a.ts");
	});
});
