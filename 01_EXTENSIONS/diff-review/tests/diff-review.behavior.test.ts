import { EventEmitter } from "node:events";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ buildReviewHtml: vi.fn(), getCommitFiles: vi.fn(), getReviewData: vi.fn(), loadReviewFileContents: vi.fn(), openQuietGlimpse: vi.fn() }));
vi.mock("../src/ui.ts", () => ({ buildReviewHtml: mocks.buildReviewHtml }));
vi.mock("../lib/git-commit-files.ts", () => ({ getCommitFiles: mocks.getCommitFiles }));
vi.mock("../lib/git-review-data.ts", () => ({ getReviewData: mocks.getReviewData }));
vi.mock("../lib/git-file-contents.ts", () => ({ loadReviewFileContents: mocks.loadReviewFileContents }));
vi.mock("../lib/glimpse-window.js", () => ({ openQuietGlimpse: mocks.openQuietGlimpse }));
import registerDiffReview from "../src/diff-review.ts";

class FakeWindow extends EventEmitter { sent: string[] = []; send(js: string) { this.sent.push(js); } close() { this.emit("closed"); } }
const data = { repoRoot: "/repo", branchBaseRef: "origin/main", branchMergeBaseSha: "base", repositoryHasHead: true, files: [{ id: "f1", path: "src/a.ts", worktreeStatus: "modified", hasWorkingTreeFile: true, inGitDiff: true, gitDiff: { status: "modified", oldPath: "src/a.ts", newPath: "src/a.ts", displayPath: "src/a.ts", hasOriginal: true, hasModified: true }, kind: "text", mimeType: null }], commits: [{ sha: "c1", shortSha: "c1", subject: "Commit", authorName: "me", authorDate: "2024", kind: "commit" }] };
function ctx() { return { cwd: "/repo", ui: { getEditorText: vi.fn(() => "existing"), notify: vi.fn(), pasteToEditor: vi.fn() } }; }

describe("diff-review behavior", () => {
	beforeEach(() => { vi.resetAllMocks(); mocks.buildReviewHtml.mockReturnValue("<html>"); });

	it("opens, serves commit/file requests, refreshes, and submits comments", async () => {
		const win = new FakeWindow();
		mocks.getReviewData.mockResolvedValue(data);
		mocks.getCommitFiles.mockResolvedValue([{ ...data.files[0], id: "cf1" }]);
		mocks.loadReviewFileContents.mockResolvedValue({ originalContent: "old", modifiedContent: "new", kind: "text", mimeType: null, originalExists: true, modifiedExists: true, originalPreviewUrl: null, modifiedPreviewUrl: null });
		mocks.openQuietGlimpse.mockResolvedValue(win);
		const registerCommand = vi.fn();
		registerDiffReview({ exec: vi.fn(), on: vi.fn(), registerCommand });
		const handler = registerCommand.mock.calls[0][1].handler;
		const context = ctx();
		await handler("", context);
		await handler("", context);
		win.emit("message", { type: "request-commit", requestId: "1", sha: "c1" });
		win.emit("message", { type: "request-file", requestId: "2", scope: "branch", fileId: "f1" });
		win.emit("message", { type: "request-review-data", requestId: "3" });
		await Promise.resolve();
		win.emit("message", { type: "submit", overallComment: "Overall", comments: [{ id: "x", fileId: "f1", scope: "branch", side: "modified", startLine: 3, endLine: 3, body: "Fix this" }] });
		expect(context.ui.notify).toHaveBeenCalledWith("A diff review window is already open.", "warning");
		expect(context.ui.pasteToEditor).toHaveBeenCalledWith("\n\nPlease address the following feedback\n\nOverall\n\n1. [branch diff] src/a.ts:3 (new)\n   Fix this");
		expect(win.sent.join("\n")).toContain("commit-data");
		expect(win.sent.join("\n")).toContain("file-data");
		expect(win.sent.join("\n")).toContain("review-data");
	});

	it("handles empty repos, cancel, and startup errors", async () => {
		const registerCommand = vi.fn();
		const on = vi.fn();
		registerDiffReview({ exec: vi.fn(), on, registerCommand });
		const handler = registerCommand.mock.calls[0][1].handler;
		const context = ctx();
		mocks.getReviewData.mockResolvedValueOnce({ ...data, files: [], commits: [] });
		await handler("", context);
		const win = new FakeWindow();
		mocks.getReviewData.mockResolvedValueOnce(data);
		mocks.openQuietGlimpse.mockResolvedValueOnce(win);
		await handler("", context);
		win.emit("message", { type: "cancel" });
		win.close();
		mocks.getReviewData.mockRejectedValueOnce(new Error("boom"));
		await handler("", context);
		expect(context.ui.notify).toHaveBeenCalledWith("No reviewable changes found.", "info");
		expect(context.ui.notify).toHaveBeenCalledWith("Diff review cancelled.", "info");
		expect(context.ui.notify).toHaveBeenCalledWith("Diff review failed: boom", "error");
	});
});
