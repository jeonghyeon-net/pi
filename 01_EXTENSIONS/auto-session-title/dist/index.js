// src/overview-constants.ts
var OVERVIEW_CUSTOM_TYPE = "auto-session-title.overview";
var OVERVIEW_OVERLAY_WIDTH = 80;

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
  return overview?.summary ?? [];
}

// src/overlay-component.ts
import { truncateToWidth, visibleWidth, wrapTextWithAnsi } from "@mariozechner/pi-tui";
var OVERVIEW_OVERLAY_MIN_WIDTH = 60;
var OVERVIEW_OVERLAY_MAX_WIDTH = 96;
var OVERVIEW_OVERLAY_MIN_TRANSCRIPT_WIDTH = 48;
function resolveOverlayWidth(termWidth) {
  const preferred = Math.min(OVERVIEW_OVERLAY_MAX_WIDTH, Math.max(OVERVIEW_OVERLAY_MIN_WIDTH, termWidth - OVERVIEW_OVERLAY_MIN_TRANSCRIPT_WIDTH));
  const fitted = Math.max(1, Math.min(termWidth, preferred));
  return fitted > 1 ? fitted - fitted % 2 : fitted;
}
function resolveOverlayCol(termWidth, width) {
  const maxCol = Math.max(0, termWidth - width);
  return maxCol - maxCol % 2;
}
function withTrailingEllipsis(line, width) {
  if (width <= 1) return truncateToWidth(line, Math.max(1, width), "\u2026", false);
  const trimmed = line.replace(/\s+$/u, "");
  const suffix = visibleWidth(trimmed) < width ? " \u2026" : "\u2026";
  return truncateToWidth(`${trimmed}${suffix}`, width, "\u2026", false);
}
function limitBodyLines(lines, width, maxBodyLines) {
  if (typeof maxBodyLines !== "number") return lines;
  if (maxBodyLines <= 0) return [];
  if (lines.length <= maxBodyLines) return lines;
  const limited = lines.slice(0, maxBodyLines);
  limited[limited.length - 1] = withTrailingEllipsis(limited[limited.length - 1], width);
  return limited;
}
var OverviewOverlayComponent = class {
  constructor(tui, theme, overview, fallbackTitle, renderOptions = {}) {
    this.tui = tui;
    this.theme = theme;
    this.overview = overview;
    this.fallbackTitle = fallbackTitle;
    this.renderOptions = renderOptions;
  }
  tui;
  theme;
  overview;
  fallbackTitle;
  renderOptions;
  cachedWidth;
  cachedLines;
  setContent(overview, fallbackTitle, renderOptions = this.renderOptions) {
    this.overview = overview;
    this.fallbackTitle = fallbackTitle;
    this.renderOptions = renderOptions;
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
    const body = this.renderOptions.compact ? [] : limitBodyLines(buildOverviewBodyLines(this.overview).flatMap((line) => wrapTextWithAnsi(line, innerWidth)), innerWidth, this.renderOptions.maxBodyLines);
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
function getOverviewOverlayOptions(termWidth) {
  if (typeof termWidth === "number") {
    const width = resolveOverlayWidth(termWidth);
    return { row: 1, col: resolveOverlayCol(termWidth, width), width, nonCapturing: true };
  }
  return { anchor: "top-right", width: OVERVIEW_OVERLAY_WIDTH, margin: { top: 1, right: 0 }, nonCapturing: true };
}

// src/overview-preview.ts
function previewOverviewFromInput(_ctx, _text) {
  return false;
}

// src/summarize.ts
import { completeSimple } from "@mariozechner/pi-ai";

// src/summary-prompt.ts
function formatPreviousSummary(summary) {
  return summary.length > 0 ? summary.join("\n\n") : "(none)";
}
function buildCompactionNote(previous) {
  const length = previous?.summary.join("\n\n").length ?? 0;
  return length > 700 ? `The stored summary is already ${length} characters long. Compact it noticeably while preserving only durable context.` : "Keep the summary compact enough to scan quickly, and compress older context instead of appending more prose each turn.";
}
function buildOverviewPrompt(recentText, previous) {
  const previousSection = previous ? [`Previous title: ${previous.title}`, "Previous summary (older versions may contain legacy line breaks; rewrite them into cohesive prose if needed):", formatPreviousSummary(previous.summary)].join("\n") : "Previous summary: (none)";
  return [
    "Update the previous summary into a cohesive current-state brief, not a turn-by-turn log.",
    "Write it for quick future recall by the user, so prioritize what they would want to remember when resuming later.",
    "Preserve still-relevant goals, decisions, constraints, blockers, and completed work unless recent updates clearly replace them.",
    "Fold recent updates into the current state instead of listing events in order.",
    "Ignore routine greetings, acknowledgements, current-branch checks, shell state, raw tool chatter, toy/demo exchanges, and the fact that the assistant replied unless they materially changed the task.",
    "If the recent updates contain no durable change, keep the previous title and summary unchanged.",
    "Prefer one dense paragraph. Use multiple paragraphs only for clearly separate concerns.",
    "If there is still no durable task or state yet, do not invent one; leave SUMMARY blank.",
    buildCompactionNote(previous),
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
  return sessionName ? `\u03C0 - ${sessionName}` : "\u03C0";
}

// src/summary-normalize.ts
var EMPTY_STATE_PATTERNS = [
  /실질적인 작업.*정해지지 않/u,
  /인사 외에 이어갈 과제가 없/u,
  /목표와 맥락부터 새로 정/u,
  /no (?:substantial|concrete) task/i,
  /nothing to resume/i,
  /start .*goal and context/i
];
function isEmptyStateLine(line) {
  return EMPTY_STATE_PATTERNS.some((pattern) => pattern.test(line));
}
function normalizeOverviewSummary(overview) {
  const summary = overview.summary.filter((line) => !isEmptyStateLine(line));
  return summary.length === overview.summary.length ? overview : { ...overview, summary };
}

// src/summary-types.ts
var MAX_SECTION_LENGTH = 240;
var MAX_TRANSCRIPT_LENGTH = 12e3;
var OVERVIEW_PROMPT = [
  "You maintain coding-session overviews.",
  "Treat the previous summary as the baseline state for the session.",
  "Carry forward still-relevant context unless recent updates clearly resolve or replace it.",
  "Do not overwrite the whole summary with only the latest turn.",
  "Write this as a quick reference for a user resuming the session later.",
  "Prioritize durable context: the current goal, important decisions, meaningful progress, blockers, and the next important step.",
  "Ignore routine greetings, acknowledgements, branch-name checks, shell state, raw tool chatter, toy/demo exchanges, and the fact that the assistant replied unless they materially change the task.",
  "If the recent updates contain no durable change, keep the previous title and summary unchanged.",
  "Return exactly this format:",
  "TITLE: <short title in the user's language, max 8 words, naming the durable task rather than chatty or incidental details>",
  "SUMMARY: <a cohesive current-state summary in the user's language>",
  "Prefer one dense paragraph; use a second short paragraph only when it materially improves clarity.",
  "Describe the current state rather than retelling events in chronological order.",
  "Merge related updates into prose instead of writing one line per turn or tool call.",
  "Keep the summary self-compacting: when it starts to sprawl, rewrite older still-relevant context more densely instead of letting the text grow turn after turn.",
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
function isRoutineSocialText(text) {
  return /^(?:안녕(?:하세요)?|반가워(?:요)?|hi|hello|hey|thanks|thank you|고마워(?:요)?|감사(?:합니다|해요)?)$/iu.test(collapseWhitespace2(text).replace(/[.!?~]+$/u, ""));
}
function extractTextContent(content) {
  if (typeof content === "string") return [content];
  return Array.isArray(content) ? content.filter((part) => Boolean(part) && typeof part === "object" && part.type === "text" && typeof part.text === "string").map((part) => part.text) : [];
}
function normalizeTextContent(content) {
  return collapseWhitespace2(extractTextContent(content).join(" "));
}
function hasBashCommandArguments(value) {
  if (!value || typeof value !== "object" || !("command" in value)) return false;
  return typeof value.command === "string";
}
function isRoutineBashCommand(argumentsValue) {
  if (!hasBashCommandArguments(argumentsValue)) return false;
  return /^(?:cd\s+.+?\s*&&\s*)*git\s+branch\s+--show-current$/iu.test(collapseWhitespace2(argumentsValue.command));
}
function extractToolCalls(content) {
  if (!Array.isArray(content)) return [];
  return content.filter((part) => Boolean(part) && typeof part === "object" && part.type === "toolCall" && typeof part.name === "string").map((part) => {
    const skipResult = part.name === "bash" && isRoutineBashCommand(part.arguments);
    return {
      toolName: part.name,
      skipResult,
      line: skipResult ? "" : truncateSection(`Tool ${part.name}: ${typeof part.arguments === "object" && part.arguments !== null ? JSON.stringify(part.arguments) : "{}"}`, 180)
    };
  });
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
  const pendingSkippedResults = {};
  for (const entry of entries) {
    if ((entry.type === "compaction" || entry.type === "branch_summary") && entry.summary) lines.push(`${entry.type === "compaction" ? "Compaction" : "Branch"} summary: ${truncateSection(entry.summary)}`);
    if (entry.type !== "message" || !entry.message?.role) continue;
    if (entry.message.role === "user") {
      const text = normalizeTextContent(entry.message.content);
      if (text && !isRoutineSocialText(text)) lines.push(`User: ${truncateSection(text)}`);
    }
    if (entry.message.role === "assistant") {
      const text = normalizeTextContent(entry.message.content);
      if (text && !isRoutineSocialText(text)) lines.push(`Assistant: ${truncateSection(text)}`);
      for (const toolCall of extractToolCalls(entry.message.content)) {
        if (toolCall.skipResult) pendingSkippedResults[toolCall.toolName] = (pendingSkippedResults[toolCall.toolName] ?? 0) + 1;
        if (toolCall.line) lines.push(toolCall.line);
      }
    }
    if (entry.message.role === "toolResult") {
      const toolName = entry.message.toolName || "tool";
      if ((pendingSkippedResults[toolName] ?? 0) > 0) {
        pendingSkippedResults[toolName] -= 1;
        continue;
      }
      const text = truncateSection(normalizeTextContent(entry.message.content), 180);
      if (text) lines.push(`Tool result ${toolName}: ${text}`);
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
  if (summaryIndex < 0 && summary.length === 0) return void 0;
  return normalizeOverviewSummary({ title, summary });
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
var NARROW_WIDGET_KEY = "auto-session-title.narrow";
var NARROW_WIDGET_BREAKPOINT = 185;
var OVERVIEW_COMPACT_ROWS = 18;
var OVERVIEW_CONDENSED_ROWS = 24;
var overlayState;
var nextOverlayId = 0;
var getLayoutKey = () => `${process.stdout.columns ?? "unknown"}:${process.stdout.rows ?? "unknown"}`;
var modeForWidth = (termWidth) => process.stdout.isTTY === true && typeof termWidth === "number" && termWidth < NARROW_WIDGET_BREAKPOINT ? "widget" : "overlay";
function resolvePresentation(termWidth, termHeight) {
  const mode = modeForWidth(termWidth);
  if (mode === "widget") return { mode, renderOptions: { compact: true } };
  if (typeof termHeight === "number") {
    if (termHeight < OVERVIEW_COMPACT_ROWS) return { mode, renderOptions: { compact: true } };
    if (termHeight < OVERVIEW_CONDENSED_ROWS) return { mode, renderOptions: { maxBodyLines: 1 } };
  }
  return { mode, renderOptions: {} };
}
function hideOverviewOverlay() {
  if (overlayState?.resizeListener) process.stdout.off("resize", overlayState.resizeListener);
  if (overlayState?.mode === "widget") overlayState.ctx.ui.setWidget(NARROW_WIDGET_KEY, void 0);
  else overlayState?.handle?.hide();
  overlayState = void 0;
}
function attachResizeListener(sessionId, overlayId) {
  if (typeof process.stdout.on !== "function" || typeof process.stdout.off !== "function") return void 0;
  const listener = () => {
    if (!overlayState || overlayState.sessionId !== sessionId || overlayState.overlayId !== overlayId || overlayState.layoutKey === getLayoutKey()) return;
    const { ctx, overview, fallbackTitle } = overlayState;
    hideOverviewOverlay();
    ensureOverviewOverlay(ctx, overview, fallbackTitle);
  };
  process.stdout.on("resize", listener);
  return listener;
}
function updateExistingOverlay(presentation, overview, fallbackTitle) {
  overlayState.overview = overview;
  overlayState.fallbackTitle = fallbackTitle;
  overlayState.presentation = presentation;
  overlayState.component.setContent(overview, fallbackTitle, presentation.renderOptions);
}
function showOverviewWidget(ctx, overlayId, sessionId, layoutKey, presentation, overview, fallbackTitle) {
  ctx.ui.setWidget(NARROW_WIDGET_KEY, (tui, theme) => {
    const component = new OverviewOverlayComponent(tui, theme, overview, fallbackTitle, presentation.renderOptions);
    overlayState = { overlayId, sessionId, ctx, layoutKey, mode: "widget", component, overview, fallbackTitle, presentation };
    overlayState.resizeListener = attachResizeListener(sessionId, overlayId);
    return component;
  }, presentation.widgetOptions);
}
function ensureOverviewOverlay(ctx, overview, fallbackTitle) {
  if (!ctx.hasUI) return;
  const sessionId = ctx.sessionManager.getSessionId();
  const layoutKey = getLayoutKey();
  const presentation = resolvePresentation(process.stdout.columns, process.stdout.rows);
  if (overlayState && (overlayState.sessionId !== sessionId || overlayState.layoutKey !== layoutKey || overlayState.mode !== presentation.mode)) hideOverviewOverlay();
  if (overlayState) return updateExistingOverlay(presentation, overview, fallbackTitle);
  const overlayId = ++nextOverlayId;
  if (presentation.mode === "widget") return showOverviewWidget(ctx, overlayId, sessionId, layoutKey, presentation, overview, fallbackTitle);
  void ctx.ui.custom((tui, theme) => {
    const component = new OverviewOverlayComponent(tui, theme, overview, fallbackTitle, presentation.renderOptions);
    overlayState = { overlayId, sessionId, ctx, layoutKey, mode: presentation.mode, component, overview, fallbackTitle, presentation };
    overlayState.resizeListener = attachResizeListener(sessionId, overlayId);
    return component;
  }, { overlay: true, overlayOptions: getOverviewOverlayOptions(process.stdout.columns), onHandle: (handle) => {
    if (overlayState?.overlayId === overlayId) overlayState.handle = handle;
  } }).catch(() => {
    if (overlayState?.overlayId === overlayId) hideOverviewOverlay();
  });
}
function clearOverlayState() {
  hideOverviewOverlay();
}

// src/overview-status.ts
var OVERVIEW_STATUS_TITLE_KEY = "auto-session-title.overview.title";
var OVERVIEW_STATUS_SUMMARY_PREFIX = "auto-session-title.overview.summary.";
var activeOverviewStatusKeys = [];
function clearStatusKeys(ctx, keys) {
  for (const key of keys) ctx.ui.setStatus(key, void 0);
}
function syncOverviewStatus(ctx, overview, fallbackTitle) {
  if (!ctx.hasUI || typeof ctx.ui.setStatus !== "function") return false;
  const title = overview?.title || fallbackTitle;
  const entries = [];
  if (title) entries.push([OVERVIEW_STATUS_TITLE_KEY, title]);
  for (const [index, line] of (overview?.summary ?? []).entries()) {
    entries.push([`${OVERVIEW_STATUS_SUMMARY_PREFIX}${index}`, line]);
  }
  const nextKeys = entries.map(([key]) => key);
  clearStatusKeys(ctx, activeOverviewStatusKeys.filter((key) => !nextKeys.includes(key)));
  for (const [key, text] of entries) ctx.ui.setStatus(key, text);
  activeOverviewStatusKeys = nextKeys;
  return true;
}
function clearOverviewStatus(ctx) {
  if (!ctx) {
    activeOverviewStatusKeys = [];
    return;
  }
  if (ctx.hasUI && typeof ctx.ui.setStatus === "function") clearStatusKeys(ctx, activeOverviewStatusKeys);
  activeOverviewStatusKeys = [];
}

// src/overview-ui.ts
function syncOverviewUi(ctx, overview, fallbackTitle) {
  if (!ctx.hasUI) return;
  if (!overview?.summary.length) return clearOverviewDisplay(ctx);
  if (syncOverviewStatus(ctx, overview, fallbackTitle)) {
    clearOverlayState();
    return;
  }
  ensureOverviewOverlay(ctx, overview, fallbackTitle);
}
function clearOverviewDisplay(ctx) {
  clearOverviewStatus(ctx);
  clearOverlayState();
}

// src/overview-sync.ts
var rerunRequested = /* @__PURE__ */ new Set();
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
function isActive(runtime2) {
  return runtime2.isActive?.() ?? true;
}
function syncTerminalTitle(ctx, title) {
  if (ctx.hasUI) ctx.ui.setTitle(buildTerminalTitle(title));
}
function toStoredOverview(overview, coveredThroughEntryId) {
  return { title: overview.title, summary: overview.summary, coveredThroughEntryId };
}
function shouldPersist(previous, next, coveredThroughEntryId) {
  return !previous || previous.title !== next.title || !sameSummary(previous.summary, next.summary) || Boolean(coveredThroughEntryId && previous.coveredThroughEntryId !== coveredThroughEntryId);
}
function restoreOverview(runtime2, ctx) {
  if (!isActive(runtime2)) return;
  const overview = findLatestOverview(ctx.sessionManager.getBranch());
  if (overview && runtime2.getSessionName() !== overview.title) runtime2.setSessionName(overview.title);
  const title = resolveFallbackTitle(overview, runtime2, ctx);
  if (!overview && !title) {
    clearOverviewDisplay(ctx);
    syncTerminalTitle(ctx);
    return;
  }
  syncOverviewUi(ctx, overview, title);
  syncTerminalTitle(ctx, title);
}
async function refreshOverview(inFlight2, runtime2, ctx) {
  const sessionId = ctx.sessionManager.getSessionId();
  if (inFlight2.has(sessionId)) {
    rerunRequested.add(sessionId);
    return;
  }
  inFlight2.add(sessionId);
  try {
    const branch = ctx.sessionManager.getBranch();
    const previous = findLatestOverview(branch);
    const recentEntries = getRecentEntries(branch, previous);
    if (recentEntries.length === 0) return restoreOverview(runtime2, ctx);
    const coveredThroughEntryId = recentEntries.at(-1)?.id;
    const recentText = buildConversationTranscript(recentEntries);
    if (!recentText) {
      if (isActive(runtime2) && previous && coveredThroughEntryId && previous.coveredThroughEntryId !== coveredThroughEntryId) runtime2.appendEntry(OVERVIEW_CUSTOM_TYPE, toStoredOverview(previous, coveredThroughEntryId));
      return restoreOverview(runtime2, ctx);
    }
    const next = await resolveSessionOverview({ recentText, previous, model: ctx.model, modelRegistry: ctx.modelRegistry });
    if (!isActive(runtime2)) return;
    if (!next) return restoreOverview(runtime2, ctx);
    if (next.summary.length === 0) {
      if (previous) return restoreOverview(runtime2, ctx);
      clearOverviewDisplay(ctx);
      return syncTerminalTitle(ctx);
    }
    if (shouldPersist(previous, next, coveredThroughEntryId)) runtime2.appendEntry(OVERVIEW_CUSTOM_TYPE, toStoredOverview(next, coveredThroughEntryId));
    if (runtime2.getSessionName() !== next.title) runtime2.setSessionName(next.title);
    syncOverviewUi(ctx, next, next.title);
    syncTerminalTitle(ctx, next.title);
  } finally {
    inFlight2.delete(sessionId);
    if (rerunRequested.delete(sessionId) && isActive(runtime2)) await refreshOverview(inFlight2, runtime2, ctx);
  }
}
function clearOverviewUi(inFlight2, ctx) {
  inFlight2.clear();
  rerunRequested.clear();
  clearOverviewDisplay(ctx);
}

// src/hooks.ts
var inFlight = /* @__PURE__ */ new Set();
var activeSessionId;
var lifecycleId = 0;
var viewId = 0;
var previewViewId = -1;
function beginView(ctx) {
  activeSessionId = ctx.sessionManager.getSessionId();
  viewId += 1;
}
function runtime(ctx, getSessionName, setSessionName, appendEntry) {
  const sessionId = ctx.sessionManager.getSessionId();
  activeSessionId = sessionId;
  const currentLifecycleId = lifecycleId;
  const currentViewId = viewId;
  return { getSessionName, setSessionName, appendEntry, isActive: () => activeSessionId === sessionId && lifecycleId === currentLifecycleId && viewId === currentViewId };
}
function queueRefresh(getSessionName, setSessionName, appendEntry, ctx) {
  void refreshOverview(inFlight, runtime(ctx, getSessionName, setSessionName, appendEntry), ctx).catch(() => void 0);
}
function createInputHandler() {
  return (event, ctx) => {
    if (event.source === "interactive" && previewViewId !== viewId && previewOverviewFromInput(ctx, event.text)) previewViewId = viewId;
    return { action: "continue" };
  };
}
function createSessionStartHandler(getSessionName, setSessionName, appendEntry) {
  return async (_event, ctx) => {
    beginView(ctx);
    restoreOverview(runtime(ctx, getSessionName, setSessionName, appendEntry), ctx);
  };
}
function createTurnEndHandler(getSessionName, setSessionName, appendEntry) {
  return (_event, ctx) => {
    if (ctx.hasPendingMessages?.()) queueRefresh(getSessionName, setSessionName, appendEntry, ctx);
  };
}
function createAgentEndHandler(getSessionName, setSessionName, appendEntry) {
  return async (_event, ctx) => refreshOverview(inFlight, runtime(ctx, getSessionName, setSessionName, appendEntry), ctx);
}
function createSessionTreeHandler(getSessionName, setSessionName, appendEntry) {
  return async (_event, ctx) => {
    beginView(ctx);
    restoreOverview(runtime(ctx, getSessionName, setSessionName, appendEntry), ctx);
  };
}
function createSessionShutdownHandler() {
  return async (_event, ctx) => {
    activeSessionId = void 0;
    lifecycleId += 1;
    viewId += 1;
    previewViewId = -1;
    clearOverviewUi(inFlight, ctx);
  };
}

// src/index.ts
function index_default(pi) {
  pi.on("input", createInputHandler());
  pi.on("session_start", createSessionStartHandler(() => pi.getSessionName(), (name) => pi.setSessionName(name), (customType, data) => pi.appendEntry(customType, data)));
  pi.on("session_tree", createSessionTreeHandler(() => pi.getSessionName(), (name) => pi.setSessionName(name), (customType, data) => pi.appendEntry(customType, data)));
  pi.on("turn_end", createTurnEndHandler(() => pi.getSessionName(), (name) => pi.setSessionName(name), (customType, data) => pi.appendEntry(customType, data)));
  pi.on("agent_end", createAgentEndHandler(() => pi.getSessionName(), (name) => pi.setSessionName(name), (customType, data) => pi.appendEntry(customType, data)));
  pi.on("session_shutdown", createSessionShutdownHandler());
}
export {
  index_default as default
};
