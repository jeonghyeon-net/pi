// src/text.ts
var GENERIC_HEADINGS = /* @__PURE__ */ new Set([
  "done",
  "completed",
  "summary",
  "summaries",
  "result",
  "results",
  "update",
  "updates",
  "\uC694\uC57D",
  "\uC644\uB8CC",
  "\uACB0\uACFC",
  "\uBCC0\uACBD\uC0AC\uD56D"
]);
function sanitizeNotificationText(text) {
  return text.replace(/[\r\n\t]+/g, " ").replace(/[\x00-\x1f\x7f;]+/g, " ").replace(/ +/g, " ").trim();
}
function stripMarkdownBlocks(text) {
  return text.replace(/```[\s\S]*?```/g, " ");
}
function stripMarkdownInline(text) {
  return text.replace(/`([^`]*)`/g, "$1").replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/[>*_~#]+/g, " ");
}
function cleanSummaryLine(line) {
  return sanitizeNotificationText(
    stripMarkdownInline(line).replace(/^\s{0,3}(?:[-*+] |\d+[.)] |#{1,6} )/u, "").replace(/^\s*\[[ xX]\]\s+/u, "")
  );
}
function truncateAtWord(text, maxLength) {
  if (text.length <= maxLength) return text;
  const clipped = text.slice(0, Math.max(1, maxLength - 1));
  const lastSpace = clipped.lastIndexOf(" ");
  return `${(lastSpace > 32 ? clipped.slice(0, lastSpace) : clipped).trimEnd()}\u2026`;
}
function extractSummaryCandidates(lines) {
  return lines.flatMap((line) => line.match(/[^.!?。！？]+[.!?。！？]?/gu) ?? [line]).map((item) => sanitizeNotificationText(item.replace(/[.!?。！？]+$/u, ""))).filter(Boolean);
}
function isGenericHeading(line) {
  return GENERIC_HEADINGS.has(line.toLowerCase());
}
function stripSummaryLabel(line) {
  return line.replace(/^(?:summary|result|update|요약|정리|결과)\s*[:：-]\s*/iu, "").trim();
}
function hasKoreanText(text) {
  return /[가-힣]/u.test(text);
}
function stripLeadingTitle(body, title) {
  const safeBody = sanitizeNotificationText(body);
  const safeTitle = sanitizeNotificationText(title);
  if (!safeBody || !safeTitle) return safeBody;
  const escaped = safeTitle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const stripped = safeBody.replace(new RegExp(`^${escaped}(?:\\s*[:\uFF1A\\-\u2013\u2014|\xB7,/]\\s*|\\s+)`, "u"), "").trim();
  return /^(?:완료|완료됨|작업 완료|끝남|끝났어)$/u.test(stripped) ? "" : stripped;
}

// src/format.ts
var FALLBACK_TITLE = "\u03C0";
var MAX_BODY_LENGTH = 140;
function extractAssistantText(messages) {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message.role !== "assistant") continue;
    if (typeof message.content === "string") {
      if (message.content.trim()) return message.content.trim();
      continue;
    }
    if (!Array.isArray(message.content)) continue;
    const text = message.content.filter((p) => p.type === "text" && typeof p.text === "string").map((p) => p.text).join("\n").trim();
    if (text) return text;
  }
  return "";
}
function normalizeSingleSummary(text, maxLength = MAX_BODY_LENGTH) {
  const lines = text.split(/\r?\n+/).map(cleanSummaryLine).filter(Boolean);
  if (!lines.length) return void 0;
  const candidates = extractSummaryCandidates(lines);
  if (!candidates.length) return void 0;
  const summary = sanitizeNotificationText(stripSummaryLabel(candidates[0]));
  return summary ? truncateAtWord(summary, maxLength) : void 0;
}
function summarizeNotificationBody(text, maxLength = MAX_BODY_LENGTH) {
  const lines = stripMarkdownBlocks(text).split(/\r?\n+/).map(cleanSummaryLine).filter(Boolean);
  if (!lines.length) return "";
  const contentLines = lines.length > 1 && isGenericHeading(lines[0]) ? lines.slice(1) : lines;
  return normalizeSingleSummary(contentLines.join("\n"), maxLength) || "";
}
function buildCompletionNotification(sessionName, messages = []) {
  const title = sanitizeNotificationText(sessionName || "") || FALLBACK_TITLE;
  const summary = stripLeadingTitle(summarizeNotificationBody(extractAssistantText(messages)), title);
  return {
    title,
    body: summary && hasKoreanText(summary) ? summary : ""
  };
}

// src/notify.ts
var FALLBACK_TITLE2 = "\u03C0";
function notifyOSC777(title, body, write) {
  write(`\x1B]777;notify;${title};${body}\x07`);
}
function notifyOSC99(title, body, write) {
  write(`\x1B]99;i=1:d=0;${title}\x1B\\`);
  if (body) write(`\x1B]99;i=1:p=body;${body}\x1B\\`);
}
function notify(title, body, write = (s) => process.stdout.write(s)) {
  const safeTitle = sanitizeNotificationText(title) || FALLBACK_TITLE2;
  const safeBody = sanitizeNotificationText(body);
  if (process.env.KITTY_WINDOW_ID) {
    notifyOSC99(safeTitle, safeBody, write);
  } else {
    notifyOSC777(safeTitle, safeBody, write);
  }
}

// src/summarize.ts
import { completeSimple } from "@mariozechner/pi-ai";
var NOTIFICATION_SUMMARY_PROMPT = [
  "You write production-style app notification bodies for coding work.",
  "Always answer in Korean.",
  "Return exactly one plain summary line.",
  "Do not repeat or restate the session title.",
  "Never output generic placeholders like Ready for input.",
  "Summarize only the single most important completed result.",
  "If multiple bullets or sentences exist, choose only one.",
  "No bullets, numbering, labels, quotes, emoji, or markdown.",
  "Keep it concise and natural."
].join(" ");
function extractText(content) {
  return content.filter((part) => part.type === "text" && typeof part.text === "string").map((part) => part.text).join("\n").trim();
}
async function resolveKoreanNotificationSummary(input, title, model, modelRegistry) {
  if (!sanitizeNotificationText(input) || !model) return void 0;
  const auth = await modelRegistry.getApiKeyAndHeaders(model);
  if (!auth.ok) return void 0;
  try {
    const message = await completeSimple(model, {
      systemPrompt: NOTIFICATION_SUMMARY_PROMPT,
      messages: [{
        role: "user",
        content: `Session title: ${title || "(none)"}
Assistant result:
${input}`,
        timestamp: Date.now()
      }]
    }, {
      apiKey: auth.apiKey,
      headers: auth.headers
    });
    if (message.stopReason === "error") return void 0;
    return normalizeSingleSummary(extractText(message.content));
  } catch {
    return void 0;
  }
}

// src/hooks.ts
function createAgentEndHandler() {
  return async (event, ctx) => {
    const sessionTitle = sanitizeNotificationText(ctx.sessionManager.getSessionName() || "");
    const fallback = buildCompletionNotification(sessionTitle, event.messages);
    const koreanBody = await resolveKoreanNotificationSummary(
      extractAssistantText(event.messages),
      sessionTitle,
      ctx.model,
      ctx.modelRegistry
    );
    const body = stripLeadingTitle(koreanBody || "", fallback.title);
    notify(fallback.title, body && hasKoreanText(body) ? body : fallback.body);
  };
}

// src/index.ts
function index_default(pi) {
  pi.on("agent_end", createAgentEndHandler());
}
export {
  index_default as default
};
