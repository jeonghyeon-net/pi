import type { Theme, ThemeColor } from "@mariozechner/pi-coding-agent";

export type { ThemeColor };
export type ThemeBg = Parameters<Theme["bg"]>[0];
export const BAR_WIDTH = 10, DIRTY_CHECK_INTERVAL_MS = 3000, PR_CHECK_INTERVAL_MS = 15000, NAME_STATUS_KEY = "session-name";
export const PR_STATUS_KEYS = {
	noPullRequest: "pr-no-pr", reviewApproved: "pr-review-approved", reviewChangesRequested: "pr-review-changes-requested",
	reviewRequired: "pr-review-required", reviewPending: "pr-review-pending", reviewDraft: "pr-review-draft",
	mergeMergeable: "pr-merge-mergeable", mergeBlocked: "pr-merge-blocked", mergeConflicting: "pr-merge-conflicting",
	mergeChecking: "pr-merge-checking", mergeDraft: "pr-merge-draft",
} as const;
export type PullRequestReviewState = "approved" | "changes-requested" | "review-required" | "pending" | "draft";
export type PullRequestMergeState = "mergeable" | "blocked" | "conflicting" | "checking" | "draft" | "no-pr";
export interface PullRequestStatus { exists: boolean; review?: PullRequestReviewState; merge: PullRequestMergeState; number?: number; title?: string; url?: string; }
export type ExecFn = (command: string, args: string[], options?: { cwd?: string }) => Promise<{ stdout: string; code: number }>;
export interface FooterTui { requestRender(): void; }
export interface FooterTheme { fg: (color: ThemeColor, text: string) => string; bg: (color: ThemeBg, text: string) => string; bold: (text: string) => string; }
export type FooterStatusEntry = readonly [string, string];
export interface FooterStatusData { getExtensionStatuses: () => ReadonlyMap<string, string>; getGitBranch: () => string | null; onBranchChange: (listener: () => void) => () => void; }
export interface FooterComponent { render(width: number): string[]; invalidate(): void; dispose(): void; }
export interface FooterContext {
	hasUI: boolean; model: { id: string } | undefined; getContextUsage(): { percent: number | null } | undefined;
	sessionManager: { getCwd(): string; getSessionName(): string | undefined };
	ui: { setFooter(factory: ((tui: FooterTui, theme: FooterTheme, footerData: FooterStatusData) => FooterComponent) | undefined): void };
}

const dim = (theme: FooterTheme, text: string) => theme.fg("dim", text);
export const STATUS_STYLE_MAP: Record<string, (theme: FooterTheme, text: string) => string> = {
	[NAME_STATUS_KEY]: (theme, text) => theme.bg("selectedBg", ` ${theme.fg("text", text)} `),
	[PR_STATUS_KEYS.noPullRequest]: dim, [PR_STATUS_KEYS.reviewApproved]: (theme, text) => theme.fg("success", text),
	[PR_STATUS_KEYS.reviewChangesRequested]: (theme, text) => theme.fg("error", text), [PR_STATUS_KEYS.reviewRequired]: (theme, text) => theme.fg("warning", text),
	[PR_STATUS_KEYS.reviewPending]: dim, [PR_STATUS_KEYS.reviewDraft]: dim, [PR_STATUS_KEYS.mergeMergeable]: (theme, text) => theme.fg("success", text),
	[PR_STATUS_KEYS.mergeBlocked]: (theme, text) => theme.fg("warning", text), [PR_STATUS_KEYS.mergeConflicting]: (theme, text) => theme.fg("error", text),
	[PR_STATUS_KEYS.mergeChecking]: dim, [PR_STATUS_KEYS.mergeDraft]: dim,
};
