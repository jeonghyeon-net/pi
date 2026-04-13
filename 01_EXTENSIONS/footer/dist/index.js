// src/footer.ts
import { truncateToWidth as truncateToWidth2 } from "@mariozechner/pi-tui";

// src/build.ts
import { visibleWidth as visibleWidth2 } from "@mariozechner/pi-tui";

// src/overview.ts
import { truncateToWidth, visibleWidth, wrapTextWithAnsi } from "@mariozechner/pi-tui";

// src/types.ts
var BAR_WIDTH = 10;
var DIRTY_CHECK_INTERVAL_MS = 3e3;
var PR_CHECK_INTERVAL_MS = 15e3;
var NAME_STATUS_KEY = "session-name";
var PR_STATUS_KEYS = {
  noPullRequest: "pr-no-pr",
  reviewApproved: "pr-review-approved",
  reviewChangesRequested: "pr-review-changes-requested",
  reviewRequired: "pr-review-required",
  reviewPending: "pr-review-pending",
  reviewDraft: "pr-review-draft",
  mergeMergeable: "pr-merge-mergeable",
  mergeBlocked: "pr-merge-blocked",
  mergeConflicting: "pr-merge-conflicting",
  mergeChecking: "pr-merge-checking",
  mergeDraft: "pr-merge-draft"
};
var dim = (theme, text) => theme.fg("dim", text);
var STATUS_STYLE_MAP = {
  [NAME_STATUS_KEY]: (theme, text) => theme.bg("selectedBg", ` ${theme.fg("text", text)} `),
  [PR_STATUS_KEYS.noPullRequest]: dim,
  [PR_STATUS_KEYS.reviewApproved]: (theme, text) => theme.fg("success", text),
  [PR_STATUS_KEYS.reviewChangesRequested]: (theme, text) => theme.fg("error", text),
  [PR_STATUS_KEYS.reviewRequired]: (theme, text) => theme.fg("warning", text),
  [PR_STATUS_KEYS.reviewPending]: dim,
  [PR_STATUS_KEYS.reviewDraft]: dim,
  [PR_STATUS_KEYS.mergeMergeable]: (theme, text) => theme.fg("success", text),
  [PR_STATUS_KEYS.mergeBlocked]: (theme, text) => theme.fg("warning", text),
  [PR_STATUS_KEYS.mergeConflicting]: (theme, text) => theme.fg("error", text),
  [PR_STATUS_KEYS.mergeChecking]: dim,
  [PR_STATUS_KEYS.mergeDraft]: dim
};

// src/utils.ts
function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}
function getFolderName(cwd) {
  const parts = cwd.split(/[\\/]/).filter(Boolean);
  return parts.length > 0 ? parts[parts.length - 1] : cwd || "unknown";
}
function sanitizeStatusText(text) {
  return text.replace(/[\r\n\t]/g, " ").replace(/ +/g, " ").trim();
}
function styleStatus(theme, key, text) {
  const style = STATUS_STYLE_MAP[key];
  return style ? style(theme, text) : text;
}
async function getRepoName(cwd, exec) {
  const result = await exec("git", ["remote", "get-url", "origin"], { cwd });
  if (result.code !== 0 || !result.stdout?.trim()) return null;
  const url = result.stdout.trim();
  const match = url.match(/\/([^/]+?)(?:\.git)?$/);
  if (!match) return null;
  return match[1];
}
async function hasUncommittedChanges(cwd, exec) {
  const result = await exec("git", ["status", "--porcelain=1", "--untracked-files=normal"], { cwd });
  if (result.code !== 0) return false;
  return result.stdout.trim().length > 0;
}

// src/overview.ts
var OVERVIEW_TITLE_KEY = "auto-session-title.overview.title";
var OVERVIEW_SUMMARY_PREFIX = "auto-session-title.overview.summary.";
var OVERVIEW_BULLET_PREFIX = "  \u2022 ";
var OVERVIEW_CONTINUATION_PREFIX = "    ";
var OVERVIEW_SKELETON_CHAR = "\u2591";
function parseOverviewIndex(key) {
  const index = Number.parseInt(key.slice(OVERVIEW_SUMMARY_PREFIX.length), 10);
  return Number.isInteger(index) && index >= 0 ? index : void 0;
}
function wrapFooterText(text, width) {
  return wrapTextWithAnsi(text, Math.max(1, width)).map((line) => truncateToWidth(line, width));
}
function wrapOverviewLine(prefix, text, width) {
  if (width <= visibleWidth(prefix)) return wrapFooterText(text, width);
  const bodyWidth = Math.max(1, width - visibleWidth(prefix));
  return wrapTextWithAnsi(text, bodyWidth).map((line, index) => `${index === 0 ? prefix : OVERVIEW_CONTINUATION_PREFIX}${line}`);
}
function buildOverviewSkeletonLines(theme, width) {
  const lineWidth = Math.max(4, width - 1);
  const long = truncateToWidth(` ${OVERVIEW_SKELETON_CHAR.repeat(Math.min(16, lineWidth))}`, width);
  const short = truncateToWidth(` ${OVERVIEW_SKELETON_CHAR.repeat(Math.min(10, lineWidth))}`, width);
  return [theme.fg("dim", long), theme.fg("dim", short)];
}
function isOverviewStatusKey(key) {
  return key === OVERVIEW_TITLE_KEY || key.startsWith(OVERVIEW_SUMMARY_PREFIX);
}
function buildFooterOverview(footerData) {
  const statuses = footerData.getExtensionStatuses();
  const title = sanitizeStatusText(statuses.get(OVERVIEW_TITLE_KEY) ?? "") || void 0;
  const summary = Array.from(statuses.entries()).filter(([key]) => key.startsWith(OVERVIEW_SUMMARY_PREFIX)).map(([key, text]) => [parseOverviewIndex(key), sanitizeStatusText(text)]).filter((entry) => typeof entry[0] === "number" && Boolean(entry[1])).sort((left, right) => left[0] - right[0]).map(([, text]) => text);
  return title || summary.length > 0 ? { title, summary } : void 0;
}
function buildFooterOverviewLines(theme, overview, width) {
  const lines = [];
  if (overview.title) lines.push(...wrapFooterText(theme.bold(theme.fg("accent", ` ${overview.title}`)), width));
  if (overview.summary.length === 0) return [...lines, ...buildOverviewSkeletonLines(theme, width)];
  for (const line of overview.summary) lines.push(...wrapOverviewLine(theme.fg("dim", OVERVIEW_BULLET_PREFIX), line, width));
  return lines;
}

// src/pr-display.ts
var REVIEW_ENTRY_MAP = {
  approved: [PR_STATUS_KEYS.reviewApproved, "\u2713 approved"],
  "changes-requested": [PR_STATUS_KEYS.reviewChangesRequested, "\xD7 changes requested"],
  "review-required": [PR_STATUS_KEYS.reviewRequired, "\u2022 review required"],
  pending: [PR_STATUS_KEYS.reviewPending, "\u2026 review pending"],
  draft: [PR_STATUS_KEYS.reviewDraft, "\xB7 draft"]
};
var MERGE_ENTRY_MAP = {
  mergeable: [PR_STATUS_KEYS.mergeMergeable, "mergeable"],
  blocked: [PR_STATUS_KEYS.mergeBlocked, "blocked"],
  conflicting: [PR_STATUS_KEYS.mergeConflicting, "conflicts"],
  checking: [PR_STATUS_KEYS.mergeChecking, "checking"],
  draft: [PR_STATUS_KEYS.mergeDraft, "draft"],
  "no-pr": [PR_STATUS_KEYS.noPullRequest, "no PR"]
};
function buildPullRequestStatusEntries(pr) {
  if (!pr) return [];
  if (!pr.exists) return [MERGE_ENTRY_MAP["no-pr"]];
  return [...pr.review ? [REVIEW_ENTRY_MAP[pr.review]] : [], MERGE_ENTRY_MAP[pr.merge]];
}

// src/pr-normalize.ts
function samePullRequestStatus(a, b) {
  return a === b || !!a && !!b && a.exists === b.exists && a.review === b.review && a.merge === b.merge && a.number === b.number && a.title === b.title && a.url === b.url;
}
function normalizePullRequest(pr) {
  const draft = pr.isDraft === true;
  return {
    exists: true,
    review: draft ? "draft" : normalizeReviewState(pr.reviewDecision),
    merge: draft ? "draft" : normalizeMergeState(pr.mergeStateStatus, pr.mergeable),
    number: typeof pr.number === "number" ? pr.number : void 0,
    title: typeof pr.title === "string" ? pr.title : void 0,
    url: typeof pr.url === "string" ? pr.url : void 0
  };
}
function normalizeReviewState(reviewDecision) {
  if (reviewDecision === "APPROVED") return "approved";
  if (reviewDecision === "CHANGES_REQUESTED") return "changes-requested";
  if (reviewDecision === "REVIEW_REQUIRED") return "review-required";
  return "pending";
}
function normalizeMergeState(state, mergeable) {
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

// src/pr-query.ts
var GH_PR_FIELDS = "number,title,url,isDraft,reviewDecision,mergeable,mergeStateStatus";
async function getPullRequestStatus(cwd, branch, exec) {
  if (!branch) return null;
  const result = await exec("gh", ["pr", "list", "--head", branch, "--state", "open", "--json", GH_PR_FIELDS, "--limit", "1"], { cwd });
  if (result.code !== 0 || !result.stdout?.trim()) return null;
  const prs = parsePullRequestList(result.stdout);
  if (!prs) return null;
  return prs[0] ? normalizePullRequest(prs[0]) : { exists: false, merge: "no-pr" };
}
function parsePullRequestList(stdout) {
  try {
    const parsed = JSON.parse(stdout);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

// src/build.ts
function buildFooterStatusEntries(_ctx, footerData) {
  return Array.from(footerData.getExtensionStatuses().entries()).filter(([key]) => key !== NAME_STATUS_KEY && !isOverviewStatusKey(key)).map(([key, text]) => [key, sanitizeStatusText(text)]).filter(([, text]) => Boolean(text));
}
function buildFooterLineParts(theme, ctx, footerData, repoName, hasDirtyChanges, prStatus, width) {
  const model = ctx.model?.id || "no-model";
  const usage = ctx.getContextUsage();
  const pct = clamp(Math.round(usage?.percent ?? 0), 0, 100);
  const filled = Math.round(pct / 100 * BAR_WIDTH);
  const bar = "#".repeat(filled) + "-".repeat(BAR_WIDTH - filled);
  const statusEntries = buildFooterStatusEntries(ctx, footerData);
  const overview = buildFooterOverview(footerData);
  const statusTexts = statusEntries.map(([, text]) => text);
  const prEntries = buildPullRequestStatusEntries(prStatus);
  const prText = prEntries.length > 0 ? theme.fg("muted", " \xB7 ") + prEntries.map(([key, text]) => styleStatus(theme, key, text)).join(theme.fg("muted", " \xB7 ")) : "";
  const active = statusTexts.filter((s) => /research(ing)?/i.test(s)).length;
  const done = statusTexts.filter((s) => /(^|\s)(done|✓)(\s|$)/i.test(s)).length;
  const folder = getFolderName(ctx.sessionManager.getCwd());
  const displayName = repoName || folder;
  const branch = footerData.getGitBranch();
  const branchText = branch ?? "no-branch";
  const dirtyMark = branch && hasDirtyChanges ? theme.fg("warning", "*") : "";
  const left = theme.fg("dim", ` ${model}`) + theme.fg("muted", " \xB7 ") + theme.fg("accent", `${displayName} - `) + dirtyMark + theme.fg("accent", branchText) + prText;
  const mid = active > 0 ? theme.fg("accent", ` \u25C9 ${active} researching`) : done > 0 ? theme.fg("success", ` \u2713 ${done} done`) : "";
  const remaining = 100 - pct;
  const barColor = remaining <= 15 ? "error" : remaining <= 40 ? "warning" : "dim";
  const right = theme.fg(barColor, `[${bar}] ${pct}% `);
  const pad = " ".repeat(Math.max(1, width - visibleWidth2(left) - visibleWidth2(mid) - visibleWidth2(right)));
  return { statusEntries, overview, left, mid, right, pad };
}

// src/footer.ts
function installFooter(ctx, exec) {
  if (!ctx.hasUI) return;
  ctx.ui.setFooter((tui, theme, footerData) => {
    let hasDirtyChanges = false, dirtyCheckInitialized = false, dirtyCheckRunning = false, prCheckRunning = false, disposed = false;
    let dirtyTimer, prTimer;
    let repoName = null, prStatus = null;
    const cwd = ctx.sessionManager.getCwd();
    const requestRender = () => {
      if (!disposed) tui.requestRender();
    };
    const fetchRepoName = async () => {
      repoName = await getRepoName(cwd, exec);
      requestRender();
    };
    const refreshDirtyState = async () => {
      if (dirtyCheckRunning) return;
      const branch = footerData.getGitBranch();
      if (branch === null) return dirtyCheckReset();
      dirtyCheckRunning = true;
      try {
        dirtyCheckSet(await hasUncommittedChanges(cwd, exec));
      } catch {
      } finally {
        dirtyCheckRunning = false;
      }
    };
    const dirtyCheckReset = () => {
      if (hasDirtyChanges || !dirtyCheckInitialized) {
        hasDirtyChanges = false;
        dirtyCheckInitialized = true;
        requestRender();
      }
    };
    const dirtyCheckSet = (next) => {
      if (!disposed && (!dirtyCheckInitialized || next !== hasDirtyChanges)) {
        hasDirtyChanges = next;
        dirtyCheckInitialized = true;
        requestRender();
      }
    };
    const refreshPrStatus = async () => {
      if (prCheckRunning) return;
      const branch = footerData.getGitBranch();
      if (branch === null) return clearPrStatus();
      prCheckRunning = true;
      try {
        setPrStatus(await getPullRequestStatus(cwd, branch, exec));
      } catch {
      } finally {
        prCheckRunning = false;
      }
    };
    const clearPrStatus = () => {
      if (prStatus !== null) {
        prStatus = null;
        requestRender();
      }
    };
    const setPrStatus = (next) => {
      if (!disposed && !samePullRequestStatus(prStatus, next)) {
        prStatus = next;
        requestRender();
      }
    };
    const unsubscribeBranch = footerData.onBranchChange(() => {
      prStatus = null;
      requestRender();
      void refreshDirtyState();
      void refreshPrStatus();
    });
    void fetchRepoName();
    void refreshDirtyState();
    void refreshPrStatus();
    dirtyTimer = setInterval(() => void refreshDirtyState(), DIRTY_CHECK_INTERVAL_MS);
    prTimer = setInterval(() => void refreshPrStatus(), PR_CHECK_INTERVAL_MS);
    return {
      dispose() {
        disposed = true;
        unsubscribeBranch();
        if (dirtyTimer) clearInterval(dirtyTimer);
        if (prTimer) clearInterval(prTimer);
      },
      invalidate() {
      },
      render(width) {
        const { statusEntries, overview, left, mid, right, pad } = buildFooterLineParts(theme, ctx, footerData, repoName, hasDirtyChanges, prStatus, width);
        const lines = [truncateToWidth2(left + mid + pad + right, width)], delimiter = theme.fg("dim", " \xB7 ");
        if (statusEntries.length > 0) lines.push(truncateToWidth2(` ${statusEntries.map(([k, t]) => styleStatus(theme, k, t)).join(delimiter)}`, width));
        if (overview) lines.push("", ...buildFooterOverviewLines(theme, overview, width));
        return lines;
      }
    };
  });
}
function teardownFooter(ctx) {
  if (ctx.hasUI) ctx.ui.setFooter(void 0);
}

// src/index.ts
function index_default(pi) {
  pi.on("session_start", async (_event, ctx) => installFooter(ctx, (c, a, o) => pi.exec(c, a, o)));
  pi.on("session_tree", async (_event, ctx) => installFooter(ctx, (c, a, o) => pi.exec(c, a, o)));
  pi.on("session_shutdown", async (_event, ctx) => teardownFooter(ctx));
}
export {
  index_default as default
};
