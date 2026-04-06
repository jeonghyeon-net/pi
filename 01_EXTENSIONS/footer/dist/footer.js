import { truncateToWidth } from "@mariozechner/pi-tui";
import { DIRTY_CHECK_INTERVAL_MS } from "./types.js";
import { getRepoName, hasUncommittedChanges, styleStatus } from "./utils.js";
import { buildFooterLineParts } from "./build.js";
export function installFooter(ctx, exec) {
    if (!ctx.hasUI)
        return;
    ctx.ui.setFooter((tui, theme, footerData) => {
        let hasDirtyChanges = false;
        let dirtyCheckInitialized = false;
        let dirtyCheckRunning = false;
        let disposed = false;
        let dirtyTimer;
        let repoName = null;
        const fetchRepoName = async () => {
            repoName = await getRepoName(ctx.sessionManager.getCwd(), exec);
            if (!disposed)
                tui.requestRender();
        };
        const refreshDirtyState = async () => {
            if (dirtyCheckRunning)
                return;
            const branch = footerData.getGitBranch();
            if (branch === null) {
                if (hasDirtyChanges || !dirtyCheckInitialized) {
                    hasDirtyChanges = false;
                    dirtyCheckInitialized = true;
                    tui.requestRender();
                }
                return;
            }
            dirtyCheckRunning = true;
            try {
                const next = await hasUncommittedChanges(ctx.sessionManager.getCwd(), exec);
                if (disposed)
                    return;
                if (!dirtyCheckInitialized || next !== hasDirtyChanges) {
                    hasDirtyChanges = next;
                    dirtyCheckInitialized = true;
                    tui.requestRender();
                }
            }
            catch {
                // Ignore git errors in footer
            }
            finally {
                dirtyCheckRunning = false;
            }
        };
        void fetchRepoName();
        void refreshDirtyState();
        dirtyTimer = setInterval(() => void refreshDirtyState(), DIRTY_CHECK_INTERVAL_MS);
        const unsubscribeBranch = footerData.onBranchChange(() => {
            tui.requestRender();
            void refreshDirtyState();
        });
        return {
            dispose() {
                disposed = true;
                unsubscribeBranch();
                if (dirtyTimer) {
                    clearInterval(dirtyTimer);
                    dirtyTimer = undefined;
                }
            },
            invalidate() { },
            render(width) {
                const { statusEntries, left, mid, right, pad } = buildFooterLineParts(theme, ctx, footerData, repoName, hasDirtyChanges, width);
                const lines = [truncateToWidth(left + mid + pad + right, width)];
                if (statusEntries.length > 0) {
                    const delimiter = theme.fg("dim", " · ");
                    const rendered = statusEntries.map(([key, text]) => styleStatus(theme, key, text));
                    lines.push(truncateToWidth(` ${rendered.join(delimiter)}`, width));
                }
                return lines;
            },
        };
    });
}
export function teardownFooter(ctx) {
    if (!ctx.hasUI)
        return;
    ctx.ui.setFooter(undefined);
}
