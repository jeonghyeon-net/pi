// src/overview-constants.ts
var OVERVIEW_CUSTOM_TYPE = "auto-session-title.overview";
var OVERVIEW_OVERLAY_WIDTH = 64;

// src/overview-entry.ts
function normalizeSummaryLine(line) {
  if (typeof line !== "string") return void 0;
  const collapsed = line.replace(/^[-*•]\s*/, "").replace(/\s+/g, " ").trim();
  return collapsed || void 0;
}
function normalizeOverviewData(data) {
  const record = data && typeof data === "object" ? data : void 0;
  const title = typeof record?.title === "string" ? record.title.trim() : "";
  const coveredThroughEntryId = typeof record?.coveredThroughEntryId === "string" ? record.coveredThroughEntryId.trim() : "";
  const summary = Array.isArray(record?.summary) ? record.summary.map(normalizeSummaryLine).filter((line) => Boolean(line)) : [];
  return title && summary.length > 0 ? { title, summary, coveredThroughEntryId: coveredThroughEntryId || void 0 } : void 0;
}
function findLatestOverview(branch) {
  for (let i = branch.length - 1; i >= 0; i--) {
    const entry = branch[i];
    if (entry.type !== "custom" || entry.customType !== OVERVIEW_CUSTOM_TYPE) continue;
    const overview = normalizeOverviewData(entry.data);
    if (!overview) continue;
    return { entryId: entry.id, coveredThroughEntryId: overview.coveredThroughEntryId || entry.id, title: overview.title, summary: overview.summary };
  }
}
function getEntriesSince(branch, checkpointEntryId) {
  if (!checkpointEntryId) return branch;
  const index = branch.findIndex((entry) => entry.id === checkpointEntryId);
  return index < 0 ? branch : branch.slice(index + 1);
}
function resolveOverviewTitle(overview, fallbackTitle) {
  return overview?.title || fallbackTitle || "\uC138\uC158 \uC694\uC57D";
}
function buildOverviewBodyLines(overview) {
  return overview?.summary ?? ["\uC694\uC57D\uC774 \uC544\uC9C1 \uC5C6\uC2B5\uB2C8\uB2E4.", "\uB2E4\uC74C \uC751\uB2F5\uC774 \uB05D\uB098\uBA74 \uC790\uB3D9\uC73C\uB85C \uC815\uB9AC\uB429\uB2C8\uB2E4."];
}

// src/overlay-component.ts
import { truncateToWidth, visibleWidth, wrapTextWithAnsi } from "@mariozechner/pi-tui";
var OverviewOverlayComponent = class {
  constructor(tui, theme, overview, fallbackTitle) {
    this.tui = tui;
    this.theme = theme;
    this.overview = overview;
    this.fallbackTitle = fallbackTitle;
  }
  tui;
  theme;
  overview;
  fallbackTitle;
  cachedWidth;
  cachedLines;
  setContent(overview, fallbackTitle) {
    this.overview = overview;
    this.fallbackTitle = fallbackTitle;
    this.invalidate();
    this.tui.requestRender();
  }
  render(width) {
    if (this.cachedLines && this.cachedWidth === width) return this.cachedLines;
    const innerWidth = Math.max(1, width - 2);
    const border = (text) => this.theme.fg("border", text);
    const pad = (text) => text + " ".repeat(Math.max(0, innerWidth - visibleWidth(text)));
    const title = truncateToWidth(` ${resolveOverviewTitle(this.overview, this.fallbackTitle)} `, Math.max(1, innerWidth - 2), "...", false);
    const header = this.theme.fg("accent", title);
    const right = "\u2500".repeat(Math.max(1, innerWidth - 1 - visibleWidth(title)));
    const body = buildOverviewBodyLines(this.overview).flatMap((line) => wrapTextWithAnsi(line, innerWidth));
    this.cachedLines = [
      border("\u256D\u2500") + header + border(`${right}\u256E`),
      ...body.map((line) => border("\u2502") + pad(line) + border("\u2502")),
      border(`\u2570${"\u2500".repeat(innerWidth)}\u256F`)
    ];
    this.cachedWidth = width;
    return this.cachedLines;
  }
  invalidate() {
    this.cachedWidth = void 0;
    this.cachedLines = void 0;
  }
};
function getOverviewOverlayOptions() {
  return {
    anchor: "top-right",
    width: OVERVIEW_OVERLAY_WIDTH,
    minWidth: 48,
    margin: { top: 1, right: 1 },
    nonCapturing: true,
    visible: (termWidth) => termWidth >= 100
  };
}

// src/summarize.ts
import { completeSimple } from "@mariozechner/pi-ai";

// src/summary-prompt.ts
function formatPreviousSummary(summary) {
  return summary.length > 0 ? summary.join("\n\n") : "(none)";
}
function buildOverviewPrompt(recentText, previous) {
  const previousSection = previous ? [`Previous title: ${previous.title}`, "Previous summary (older versions may contain legacy line breaks; rewrite them into cohesive prose if needed):", formatPreviousSummary(previous.summary)].join("\n") : "Previous summary: (none)";
  return [
    "Update the previous summary into a cohesive current-state brief, not a turn-by-turn log.",
    "Preserve still-relevant goals, decisions, constraints, blockers, and completed work unless recent updates clearly replace them.",
    "Fold recent updates into the current state instead of listing events in order.",
    "Prefer one dense paragraph. Use multiple paragraphs only for clearly separate concerns.",
    previousSection,
    "",
    "Recent conversation updates below are raw chronological notes, not the desired output format:",
    recentText
  ].join("\n");
}

// src/title.ts
var DEFAULT_MAX_TITLE_LENGTH = 48;
function collapseWhitespace(text) {
  return text.replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim();
}
function stripMarkdownNoise(text) {
  return text.replace(/```[\s\S]*?```/g, " ").replace(/`+/g, " ");
}
function stripListPrefix(text) {
  return text.replace(/^(?:[#>*-]+|\d+[.)])\s+/, "");
}
function stripWrappingPunctuation(text) {
  return text.replace(/^["'`“”‘’([{]+/, "").replace(/["'`“”‘’)}\].,!?;:]+$/u, "").trim();
}
function truncateTitle(text, maxLength = DEFAULT_MAX_TITLE_LENGTH) {
  if (text.length <= maxLength) return text;
  const clipped = text.slice(0, maxLength + 1);
  const lastWordBreak = Math.max(
    clipped.lastIndexOf(" "),
    clipped.lastIndexOf(":"),
    clipped.lastIndexOf("-"),
    clipped.lastIndexOf("\u2014"),
    clipped.lastIndexOf(",")
  );
  const cutoff = lastWordBreak >= Math.floor(maxLength * 0.6) ? lastWordBreak : maxLength;
  return `${clipped.slice(0, cutoff).trimEnd()}\u2026`;
}
function normalizeTitle(text, maxLength = DEFAULT_MAX_TITLE_LENGTH) {
  const cleaned = collapseWhitespace(stripListPrefix(stripMarkdownNoise(text)));
  if (!cleaned) return void 0;
  const title = truncateTitle(stripWrappingPunctuation(cleaned), maxLength).trim();
  return title || void 0;
}
function buildTerminalTitle(sessionName) {
  return `\u03C0 - ${sessionName}`;
}

// src/summary-types.ts
var MAX_SECTION_LENGTH = 240;
var MAX_TRANSCRIPT_LENGTH = 12e3;
var OVERVIEW_PROMPT = [
  "You maintain coding-session overviews.",
  "Treat the previous summary as the baseline state for the session.",
  "Carry forward still-relevant context unless recent updates clearly resolve or replace it.",
  "Do not overwrite the whole summary with only the latest turn.",
  "Return exactly this format:",
  "TITLE: <short title in the user's language, max 8 words>",
  "SUMMARY: <a cohesive current-state summary in the user's language>",
  "Prefer one dense paragraph; use a second paragraph only when it materially improves clarity.",
  "Describe the current state rather than retelling events in chronological order.",
  "Merge related updates into prose instead of writing one line per turn or tool call.",
  "Do not drop still-relevant context merely to make the summary shorter.",
  "Do not use markdown bullets, numbered lists, code fences, or extra sections."
].join(" ");

// src/summary-text.ts
function collapseWhitespace2(text) {
  return text.replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim();
}
function truncateSection(text, maxLength = MAX_SECTION_LENGTH) {
  const collapsed = collapseWhitespace2(text);
  return collapsed.length <= maxLength ? collapsed : `${collapsed.slice(0, maxLength - 1).trimEnd()}\u2026`;
}
function extractTextContent(content) {
  if (typeof content === "string") return [content];
  return Array.isArray(content) ? content.filter((part) => Boolean(part) && typeof part === "object" && part.type === "text" && typeof part.text === "string").map((part) => part.text) : [];
}
function extractToolCalls(content) {
  if (!Array.isArray(content)) return [];
  return content.filter((part) => Boolean(part) && typeof part === "object" && part.type === "toolCall" && typeof part.name === "string").map((part) => truncateSection(`Tool ${part.name}: ${typeof part.arguments === "object" && part.arguments !== null ? JSON.stringify(part.arguments) : "{}"}`, 180));
}
function clipTranscript(text) {
  if (text.length <= MAX_TRANSCRIPT_LENGTH) return text;
  const head = text.slice(0, 4e3).trimEnd();
  const tail = text.slice(-(MAX_TRANSCRIPT_LENGTH - head.length - 32)).trimStart();
  return `${head}

[... earlier context omitted ...]

${tail}`;
}
function extractSummaryLines(raw) {
  return raw.split(/\r?\n\s*\r?\n+/).map((paragraph) => paragraph.split(/\r?\n/).map((line) => line.replace(/^(?:[-*•]+|\d+[.)])\s*/, "").trim()).filter(Boolean).join(" ")).map(collapseWhitespace2).filter(Boolean);
}
function buildConversationTranscript(entries) {
  const lines = [];
  for (const entry of entries) {
    if ((entry.type === "compaction" || entry.type === "branch_summary") && entry.summary) lines.push(`${entry.type === "compaction" ? "Compaction" : "Branch"} summary: ${truncateSection(entry.summary)}`);
    if (entry.type !== "message" || !entry.message?.role) continue;
    if (entry.message.role === "user") lines.push(...extractTextContent(entry.message.content).join(" ") ? [`User: ${truncateSection(extractTextContent(entry.message.content).join(" "))}`] : []);
    if (entry.message.role === "assistant") {
      const text = truncateSection(extractTextContent(entry.message.content).join(" "));
      if (text) lines.push(`Assistant: ${text}`);
      lines.push(...extractToolCalls(entry.message.content));
    }
    if (entry.message.role === "toolResult") {
      const text = truncateSection(extractTextContent(entry.message.content).join(" "), 180);
      if (text) lines.push(`Tool result ${entry.message.toolName || "tool"}: ${text}`);
    }
  }
  return clipTranscript(lines.join("\n"));
}

// src/summary-parse.ts
function parseOverviewResponse(response) {
  const lines = response.split(/\r?\n/);
  const titleLine = lines.find((line) => /^TITLE\s*:/i.test(line));
  const title = normalizeTitle(titleLine?.replace(/^TITLE\s*:/i, "").trim() ?? "");
  if (!title) return void 0;
  const summaryIndex = lines.findIndex((line) => /^SUMMARY\s*:/i.test(line));
  const inlineSummary = summaryIndex >= 0 ? lines[summaryIndex].replace(/^SUMMARY\s*:/i, "").trim() : "";
  const remainder = summaryIndex >= 0 ? lines.slice(summaryIndex + 1) : lines.filter((line) => !/^TITLE\s*:/i.test(line));
  const summary = extractSummaryLines([...inlineSummary ? [inlineSummary] : [], ...remainder].join("\n"));
  return summary.length > 0 ? { title, summary } : void 0;
}
function extractAssistantText(message) {
  return message.content.filter((part) => part.type === "text").map((part) => part.text).join("\n").trim();
}

// src/summarize.ts
async function resolveSessionOverview(options) {
  if (!options.model || !options.recentText.trim()) return void 0;
  const auth = await options.modelRegistry.getApiKeyAndHeaders(options.model);
  if (!auth.ok) return void 0;
  try {
    const message = await completeSimple(
      options.model,
      { systemPrompt: OVERVIEW_PROMPT, messages: [{ role: "user", content: buildOverviewPrompt(options.recentText, options.previous), timestamp: Date.now() }] },
      { apiKey: auth.apiKey, headers: auth.headers }
    );
    return message.stopReason === "error" ? void 0 : parseOverviewResponse(extractAssistantText(message));
  } catch {
    return void 0;
  }
}

// src/overlay-state.ts
var overlayState;
function hideOverviewOverlay() {
  overlayState?.handle?.hide();
  overlayState = void 0;
}
function ensureOverviewOverlay(ctx, overview, fallbackTitle) {
  if (!ctx.hasUI) return;
  const sessionId = ctx.sessionManager.getSessionId();
  if (overlayState && overlayState.sessionId !== sessionId) hideOverviewOverlay();
  if (overlayState) return overlayState.component.setContent(overview, fallbackTitle);
  void ctx.ui.custom(
    (tui, theme) => {
      const component = new OverviewOverlayComponent(tui, theme, overview, fallbackTitle);
      overlayState = { sessionId, component };
      return component;
    },
    { overlay: true, overlayOptions: getOverviewOverlayOptions(), onHandle: (handle) => {
      if (overlayState?.sessionId === sessionId) overlayState.handle = handle;
    } }
  ).catch(() => {
    if (overlayState?.sessionId === sessionId) overlayState = void 0;
  });
}
function clearOverlayState() {
  hideOverviewOverlay();
}

// src/overview-sync.ts
function sameSummary(left, right) {
  return left.length === right.length && left.every((line, index) => line === right[index]);
}
function resolveFallbackTitle(previous, runtime2, ctx) {
  return previous?.title || runtime2.getSessionName() || ctx.sessionManager.getSessionName();
}
function getRecentEntries(branch, previous) {
  if (!previous) return branch;
  const sinceCovered = getEntriesSince(branch, previous.coveredThroughEntryId);
  return sinceCovered === branch ? getEntriesSince(branch, previous.entryId) : sinceCovered;
}
function syncTerminalTitle(ctx, title) {
  if (ctx.hasUI && title) ctx.ui.setTitle(buildTerminalTitle(title));
}
function toStoredOverview(overview, coveredThroughEntryId) {
  return { title: overview.title, summary: overview.summary, coveredThroughEntryId };
}
function shouldPersist(previous, next, coveredThroughEntryId) {
  return !previous || previous.title !== next.title || !sameSummary(previous.summary, next.summary) || Boolean(coveredThroughEntryId && previous.coveredThroughEntryId !== coveredThroughEntryId);
}
function restoreOverview(runtime2, ctx) {
  const overview = findLatestOverview(ctx.sessionManager.getBranch());
  if (overview && runtime2.getSessionName() !== overview.title) runtime2.setSessionName(overview.title);
  const title = resolveFallbackTitle(overview, runtime2, ctx);
  ensureOverviewOverlay(ctx, overview, title);
  syncTerminalTitle(ctx, title);
}
async function refreshOverview(inFlight2, runtime2, ctx) {
  const sessionId = ctx.sessionManager.getSessionId();
  if (inFlight2.has(sessionId)) return;
  inFlight2.add(sessionId);
  try {
    const branch = ctx.sessionManager.getBranch();
    const previous = findLatestOverview(branch);
    const recentEntries = getRecentEntries(branch, previous);
    if (recentEntries.length === 0) return restoreOverview(runtime2, ctx);
    const coveredThroughEntryId = recentEntries.at(-1)?.id;
    const recentText = buildConversationTranscript(recentEntries);
    if (!recentText) {
      if (previous && coveredThroughEntryId && previous.coveredThroughEntryId !== coveredThroughEntryId) runtime2.appendEntry(OVERVIEW_CUSTOM_TYPE, toStoredOverview(previous, coveredThroughEntryId));
      return restoreOverview(runtime2, ctx);
    }
    const next = await resolveSessionOverview({ recentText, previous, model: ctx.model, modelRegistry: ctx.modelRegistry });
    if (!next) return restoreOverview(runtime2, ctx);
    if (shouldPersist(previous, next, coveredThroughEntryId)) runtime2.appendEntry(OVERVIEW_CUSTOM_TYPE, toStoredOverview(next, coveredThroughEntryId));
    if (runtime2.getSessionName() !== next.title) runtime2.setSessionName(next.title);
    ensureOverviewOverlay(ctx, next, next.title);
    syncTerminalTitle(ctx, next.title);
  } finally {
    inFlight2.delete(sessionId);
  }
}
function clearOverviewUi(inFlight2, _ctx) {
  inFlight2.clear();
  clearOverlayState();
}

// src/hooks.ts
var inFlight = /* @__PURE__ */ new Set();
function runtime(getSessionName, setSessionName, appendEntry) {
  return { getSessionName, setSessionName, appendEntry };
}
function createSessionStartHandler(getSessionName, setSessionName, appendEntry) {
  return async (_event, ctx) => restoreOverview(runtime(getSessionName, setSessionName, appendEntry), ctx);
}
function createAgentEndHandler(getSessionName, setSessionName, appendEntry) {
  return async (_event, ctx) => refreshOverview(inFlight, runtime(getSessionName, setSessionName, appendEntry), ctx);
}
function createSessionTreeHandler(getSessionName, setSessionName, appendEntry) {
  return async (_event, ctx) => restoreOverview(runtime(getSessionName, setSessionName, appendEntry), ctx);
}
function createSessionShutdownHandler() {
  return async (_event, _ctx) => clearOverviewUi(inFlight);
}

// src/index.ts
function index_default(pi) {
  pi.on("session_start", createSessionStartHandler(() => pi.getSessionName(), (name) => pi.setSessionName(name), (customType, data) => pi.appendEntry(customType, data)));
  pi.on("session_tree", createSessionTreeHandler(() => pi.getSessionName(), (name) => pi.setSessionName(name), (customType, data) => pi.appendEntry(customType, data)));
  pi.on("agent_end", createAgentEndHandler(() => pi.getSessionName(), (name) => pi.setSessionName(name), (customType, data) => pi.appendEntry(customType, data)));
  pi.on("session_shutdown", createSessionShutdownHandler());
}
export {
  index_default as default
};
