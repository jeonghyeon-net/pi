import { truncateToWidth } from "@mariozechner/pi-tui";
import { buildFooterLineParts, buildFooterOverviewLines } from "./build.js";
import { getPullRequestStatus, samePullRequestStatus } from "./pr.js";
import type { ExecFn, FooterContext, PullRequestStatus } from "./types.js";
import { DIRTY_CHECK_INTERVAL_MS, PR_CHECK_INTERVAL_MS } from "./types.js";
import { getRepoName, hasUncommittedChanges, styleStatus } from "./utils.js";

export function installFooter(ctx: FooterContext, exec: ExecFn) {
	if (!ctx.hasUI) return;
	ctx.ui.setFooter((tui, theme, footerData) => {
		let hasDirtyChanges = false, dirtyCheckInitialized = false, dirtyCheckRunning = false, prCheckRunning = false, disposed = false;
		let dirtyTimer: ReturnType<typeof setInterval> | undefined, prTimer: ReturnType<typeof setInterval> | undefined;
		let repoName: string | null = null, prStatus: PullRequestStatus | null = null;
		const cwd = ctx.sessionManager.getCwd();
		const requestRender = () => { if (!disposed) tui.requestRender(); };
		const fetchRepoName = async () => { repoName = await getRepoName(cwd, exec); requestRender(); };
		const refreshDirtyState = async () => {
			if (dirtyCheckRunning) return;
			const branch = footerData.getGitBranch();
			if (branch === null) return dirtyCheckReset();
			dirtyCheckRunning = true;
			try { dirtyCheckSet(await hasUncommittedChanges(cwd, exec)); } catch {} finally { dirtyCheckRunning = false; }
		};
		const dirtyCheckReset = () => { if (hasDirtyChanges || !dirtyCheckInitialized) { hasDirtyChanges = false; dirtyCheckInitialized = true; requestRender(); } };
		const dirtyCheckSet = (next: boolean) => { if (!disposed && (!dirtyCheckInitialized || next !== hasDirtyChanges)) { hasDirtyChanges = next; dirtyCheckInitialized = true; requestRender(); } };
		const refreshPrStatus = async () => {
			if (prCheckRunning) return;
			const branch = footerData.getGitBranch();
			if (branch === null) return clearPrStatus();
			prCheckRunning = true;
			try { setPrStatus(await getPullRequestStatus(cwd, branch, exec)); } catch {} finally { prCheckRunning = false; }
		};
		const clearPrStatus = () => { if (prStatus !== null) { prStatus = null; requestRender(); } };
		const setPrStatus = (next: PullRequestStatus | null) => { if (!disposed && !samePullRequestStatus(prStatus, next)) { prStatus = next; requestRender(); } };
		const unsubscribeBranch = footerData.onBranchChange(() => { prStatus = null; requestRender(); void refreshDirtyState(); void refreshPrStatus(); });
		void fetchRepoName(); void refreshDirtyState(); void refreshPrStatus();
		dirtyTimer = setInterval(() => void refreshDirtyState(), DIRTY_CHECK_INTERVAL_MS);
		prTimer = setInterval(() => void refreshPrStatus(), PR_CHECK_INTERVAL_MS);
		return {
			dispose() { disposed = true; unsubscribeBranch(); if (dirtyTimer) clearInterval(dirtyTimer); if (prTimer) clearInterval(prTimer); },
			invalidate() {},
			render(width: number): string[] {
				const { statusEntries, overview, left, mid, right, pad } = buildFooterLineParts(theme, ctx, footerData, repoName, hasDirtyChanges, prStatus, width);
				const lines = [truncateToWidth(left + mid + pad + right, width)], delimiter = theme.fg("dim", " · ");
				if (statusEntries.length > 0) lines.push(truncateToWidth(` ${statusEntries.map(([k, t]) => styleStatus(theme, k, t)).join(delimiter)}`, width));
				if (overview) lines.push(...buildFooterOverviewLines(theme, overview, width));
				return lines;
			},
		};
	});
}

export function teardownFooter(ctx: FooterContext) { if (ctx.hasUI) ctx.ui.setFooter(undefined); }
