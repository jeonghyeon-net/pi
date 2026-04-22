import type { ExtensionCommandContext, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { getCommitFiles } from "./git-commit-files.js";
import { loadReviewFileContents } from "./git-file-contents.js";
import { getReviewData } from "./git-review-data.js";
import { isCancel, isRequestCommit, isRequestFile, isRequestReviewData, isSubmit } from "./message-guards.js";
import { composeReviewPrompt, hasReviewFeedback } from "./prompt.js";
import { openQuietGlimpse, type QuietGlimpseWindow } from "./glimpse-window.js";
import { sendWindowMessage } from "./window-send.js";
import type { ReviewCommandApi, ReviewFile, ReviewWindowData } from "../src/types.js";
import { buildReviewHtml } from "../src/ui.js";

function appendPrompt(ctx: ExtensionCommandContext, prompt: string): void {
	ctx.ui.pasteToEditor(`${ctx.ui.getEditorText().trim() ? "\n\n" : ""}${prompt}`);
}

function replaceFiles(target: Map<string, ReviewFile>, files: ReviewFile[]): void {
	for (const [id, file] of [...target.entries()]) if (!id.startsWith("commit::")) target.delete(id);
	for (const file of files) target.set(file.id, file);
}

export default function registerDiffReview(_pi: ReviewCommandApi) {
	let activeWindow: QuietGlimpseWindow | null = null;
	const ignored = new WeakSet<QuietGlimpseWindow>();
	const closeWindow = (suppress = false) => { if (activeWindow) { const window = activeWindow; activeWindow = null; if (suppress) ignored.add(window); window.close(); } };
	const handleCommand = async (_args: string, ctx: ExtensionCommandContext) => {
		if (activeWindow) return void ctx.ui.notify("A diff review window is already open.", "warning");
		try {
			let data: ReviewWindowData = await getReviewData(_pi, ctx.cwd);
			if (data.files.length === 0 && data.commits.length === 0) return void ctx.ui.notify("No reviewable changes found.", "info");
			const fileMap = new Map<string, ReviewFile>(data.files.map((file) => [file.id, file]));
			const commitCache = new Map<string, Promise<ReviewFile[]>>();
			const contentCache = new Map<string, Promise<import("../src/types.js").ReviewFileContents>>();
			const window = await openQuietGlimpse(buildReviewHtml(data), { width: 1680, height: 1020, title: "pi diff review" });
			activeWindow = window;
			window.on("message", async (message: unknown) => {
				if (isRequestCommit(message)) try { const files = await (commitCache.get(message.sha) ?? getCommitFiles(_pi, data.repoRoot, message.sha)); commitCache.set(message.sha, Promise.resolve(files)); files.forEach((file) => fileMap.set(file.id, file)); sendWindowMessage(window, { type: "commit-data", requestId: message.requestId, sha: message.sha, files }); } catch (error) { sendWindowMessage(window, { type: "commit-error", requestId: message.requestId, sha: message.sha, message: error instanceof Error ? error.message : String(error) }); }
				if (isRequestFile(message)) try { const file = fileMap.get(message.fileId); if (!file) throw new Error("Unknown file requested."); const key = `${message.scope}:${message.commitSha ?? ""}:${message.fileId}`; const contents = await (contentCache.get(key) ?? loadReviewFileContents(_pi, data.repoRoot, file, message.scope, message.commitSha ?? null, data.branchMergeBaseSha)); contentCache.set(key, Promise.resolve(contents)); sendWindowMessage(window, { type: "file-data", requestId: message.requestId, fileId: message.fileId, scope: message.scope, commitSha: message.commitSha ?? null, ...contents }); } catch (error) { sendWindowMessage(window, { type: "file-error", requestId: message.requestId, fileId: message.fileId, scope: message.scope, commitSha: message.commitSha ?? null, message: error instanceof Error ? error.message : String(error) }); }
				if (isRequestReviewData(message)) { commitCache.clear(); contentCache.clear(); data = await getReviewData(_pi, data.repoRoot); replaceFiles(fileMap, data.files); sendWindowMessage(window, { type: "review-data", requestId: message.requestId, files: data.files, commits: data.commits, branchBaseRef: data.branchBaseRef, branchMergeBaseSha: data.branchMergeBaseSha, repositoryHasHead: data.repositoryHasHead }); }
				if (isCancel(message)) ctx.ui.notify("Diff review cancelled.", "info");
				if (isSubmit(message) && hasReviewFeedback(message)) { appendPrompt(ctx, composeReviewPrompt([...fileMap.values()], message)); ctx.ui.notify("Appended diff review feedback to the editor.", "info"); }
			});
			window.on("closed", () => { if (activeWindow === window) activeWindow = null; });
			window.on("error", (error) => { if (!ignored.has(window)) ctx.ui.notify(`Diff review failed: ${error.message}`, "error"); });
			ctx.ui.notify("Opened diff review window.", "info");
		} catch (error) { closeWindow(true); ctx.ui.notify(`Diff review failed: ${error instanceof Error ? error.message : String(error)}`, "error"); }
	};
	_pi.registerCommand("diff-review", { description: "Open a native diff review window for the current repository", handler: handleCommand });
	_pi.on("session_shutdown", (_event: object, _ctx: ExtensionContext) => closeWindow(true));
}
