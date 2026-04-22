// src/title-generator.ts
import { completeSimple } from "@mariozechner/pi-ai";

// src/title-format.ts
import * as path from "node:path";
var TITLE_STATUS_KEY = "session-title";
var MAX_PROMPT_CHARS = 800;
var MAX_TITLE_CHARS = 48;
var MAX_STATUS_CHARS = 72;
var MAX_TERMINAL_TITLE_CHARS = 60;
var TITLE_SYSTEM_PROMPT = [
  "You write short, explicit session titles for a coding task.",
  "Preserve the user's language.",
  "Rewrite the request as an organized summary title instead of copying the request verbatim.",
  "Keep the core task, but drop URLs, politeness, commit/push/test instructions, and placement logistics unless they are central.",
  "Make the title concrete and action-oriented.",
  "Include the action and the main object or scope when possible.",
  "Avoid vague titles like 'extension', 'bug', 'question', or 'help'.",
  "Return only the title text with no labels, quotes, or markdown.",
  `Keep it to one line and under ${MAX_TITLE_CHARS} characters.`
].join(" ");
function clip(text, maxChars) {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars - 1).trimEnd()}\u2026`;
}
function stripWrappingPair(text, open, close) {
  if (text.startsWith(open) && text.endsWith(close) && text.length > open.length + close.length) {
    return text.slice(open.length, text.length - close.length).trim();
  }
  return text;
}
function buildTitlePrompt(userPrompt) {
  return `User request:
${userPrompt.slice(0, MAX_PROMPT_CHARS)}`;
}
function extractTextContent(content) {
  return content.filter((part) => part.type === "text" && typeof part.text === "string").map((part) => part.text).join("").trim();
}
function normalizeTitle(rawTitle) {
  const firstLine = rawTitle.split(/\r?\n/gu).map((line) => line.trim()).find(Boolean) ?? "";
  let normalized = firstLine.replace(/^[-*•]\s*/u, "").replace(/^(title|session title|session name|name|제목|세션 제목|세션 이름)\s*[:：-]\s*/iu, "").trim();
  for (const [open, close] of [['"', '"'], ["'", "'"], ["`", "`"], ["(", ")"], ["[", "]"], ["\u201C", "\u201D"], ["\u2018", "\u2019"]]) {
    normalized = stripWrappingPair(normalized, open, close);
  }
  return clip(normalized.replace(/\s+/gu, " ").replace(/[.。!！?？:：;；,，\-–—\s]+$/gu, "").trim(), MAX_TITLE_CHARS);
}
var REQUEST_NOISE_RE = /(please|can you|could you|would you|help me|i need you to|이거|참고해서|좀|혹시|작업해줘|구현해줘|만들어줘|해줘|해주세요|commit|push|커밋|푸시)/iu;
function isClearSummaryTitle(title) {
  const normalized = normalizeTitle(title);
  return normalized.length > 0 && !REQUEST_NOISE_RE.test(normalized) && !/[?？]/u.test(normalized);
}
function formatStatusTitle(title) {
  return clip(title.replace(/\s+/gu, " ").trim(), MAX_STATUS_CHARS);
}
function formatTerminalTitle(title, cwd) {
  const projectName = path.basename(cwd) || "pi";
  const clippedTitle = title ? clip(title.replace(/\s+/gu, " ").trim(), MAX_TERMINAL_TITLE_CHARS) : void 0;
  return clippedTitle ? `\u03C0 - ${clippedTitle} - ${projectName}` : `\u03C0 - ${projectName}`;
}

// src/fallback-title.ts
function sanitizeRequestText(text) {
  return text.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/gu, "$1").replace(/https?:\/\/\S+/gu, " ").replace(/`([^`]+)`/gu, "$1").replace(/[>#*_~]+/gu, " ").replace(/\s+/gu, " ").trim();
}
function stripRequestFraming(text) {
  return text.replace(/^(docs|documentation|readme)\s+/iu, "").replace(/^(please|can you|could you|would you|help me|i need you to)\s+/iu, "").replace(/^(이거\s*참고해서|이거|좀|혹시)\s+/u, "").replace(/\s*(작업해줘|구현해줘|만들어줘|해주세요|해줘|부탁해|부탁합니다)$/u, "").trim();
}
function stripLogistics(text) {
  return text.replace(/(?:^|\s)(다 만들고\s*)?(커밋|푸시|commit|push|typecheck|test|build).*/iu, "").replace(/(?:^|\s)(extensions?에 만들면 됨|extensions?에 넣어줘).*/iu, "").trim();
}
function summarizeKnownTask(text) {
  const korean = /[가-힣]/u.test(text);
  const suffix = /\bextensions?\b/iu.test(text) || /extensions?에/u.test(text) ? " extension" : "";
  const hasSessionTitle = /(session (name|title)|세션 (이름|제목))/iu.test(text);
  const hasTerminalTitle = /(terminal title|터미널 제목)/iu.test(text);
  if (hasSessionTitle && hasTerminalTitle) {
    if (korean) return `\uC138\uC158/\uD130\uBBF8\uB110 \uC81C\uBAA9 \uC790\uB3D9 \uC124\uC815${suffix}`;
    return `session/terminal title auto sync${suffix}`;
  }
  if (hasSessionTitle) {
    if (korean) return `\uC138\uC158 \uC81C\uBAA9 \uC790\uB3D9 \uC124\uC815${suffix}`;
    return `session title auto naming${suffix}`;
  }
  if (hasTerminalTitle) {
    if (korean) return `\uD130\uBBF8\uB110 \uC81C\uBAA9 \uC790\uB3D9 \uC124\uC815${suffix}`;
    return `terminal title sync${suffix}`;
  }
  return "";
}
function buildFallbackTitle(userPrompt) {
  const cleaned = stripLogistics(sanitizeRequestText(userPrompt));
  if (!cleaned) return "";
  const summarized = summarizeKnownTask(cleaned);
  if (summarized) return normalizeTitle(summarized);
  const parts = cleaned.split(/[\n\r]+|(?<=[.!?。！？])\s+/u).map((part) => stripRequestFraming(part)).filter(Boolean);
  const candidate = parts.find((part) => part.length >= 4) ?? stripRequestFraming(cleaned);
  return normalizeTitle(candidate);
}

// src/title-generator.ts
async function generateSessionTitle(ctx, userPrompt) {
  const fallbackTitle = buildFallbackTitle(userPrompt);
  if (!ctx.model || !ctx.modelRegistry) return fallbackTitle;
  const auth = await ctx.modelRegistry.getApiKeyAndHeaders(ctx.model).catch(() => void 0);
  if (!auth?.ok) return fallbackTitle;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 1e4);
  const result = await completeSimple(
    ctx.model,
    { systemPrompt: TITLE_SYSTEM_PROMPT, messages: [{ role: "user", content: [{ type: "text", text: buildTitlePrompt(userPrompt) }], timestamp: Date.now() }] },
    { apiKey: auth.apiKey, headers: auth.headers, signal: controller.signal, reasoning: "minimal", maxTokens: 80 }
  ).catch(() => void 0);
  clearTimeout(timeoutId);
  if (!result || result.stopReason !== "stop") return fallbackTitle;
  const generatedTitle = normalizeTitle(extractTextContent(result.content));
  return isClearSummaryTitle(generatedTitle) ? generatedTitle : fallbackTitle;
}

// src/session-path.ts
import * as os from "node:os";
import * as path2 from "node:path";
var SUBAGENT_SESSION_DIR = path2.join(os.homedir(), ".pi", "agent", "sessions", "subagents");
function isSubagentSessionPath(sessionFilePath) {
  if (!sessionFilePath) return false;
  return sessionFilePath.startsWith(`${SUBAGENT_SESSION_DIR}${path2.sep}`) || sessionFilePath.startsWith(`${SUBAGENT_SESSION_DIR}/`);
}
function extractSessionFilePath(sessionManager) {
  try {
    if (!sessionManager || typeof sessionManager !== "object" || !("getSessionFile" in sessionManager)) return void 0;
    const getSessionFile = sessionManager.getSessionFile;
    if (typeof getSessionFile !== "function") return void 0;
    const sessionFilePath = String(getSessionFile() ?? "").replace(/[\r\n\t]+/gu, "").trim();
    return sessionFilePath || void 0;
  } catch {
    return void 0;
  }
}

// src/session-title-state.ts
function getSessionTitle(pi, ctx) {
  const currentTitle = pi.getSessionName()?.trim();
  if (currentTitle) return currentTitle;
  try {
    const getSessionName = ctx.sessionManager.getSessionName;
    if (typeof getSessionName !== "function") return void 0;
    const restoredTitle = String(getSessionName() ?? "").trim();
    return restoredTitle || void 0;
  } catch {
    return void 0;
  }
}
function shouldAutoNameSession(pi, ctx, userPrompt, namingInFlight) {
  if (namingInFlight) return false;
  if (getSessionTitle(pi, ctx)) return false;
  if (!userPrompt.trim()) return false;
  return !isSubagentSessionPath(extractSessionFilePath(ctx.sessionManager));
}

// src/session-title-ui.ts
function syncSessionTitleUi(pi, ctx) {
  if (!ctx.hasUI) return;
  const sessionTitle = getSessionTitle(pi, ctx);
  ctx.ui.setStatus(TITLE_STATUS_KEY, sessionTitle ? formatStatusTitle(sessionTitle) : void 0);
  ctx.ui.setTitle(formatTerminalTitle(sessionTitle, ctx.cwd));
}
function clearSessionTitleUi(ctx) {
  if (!ctx.hasUI) return;
  ctx.ui.setStatus(TITLE_STATUS_KEY, void 0);
  ctx.ui.setTitle(formatTerminalTitle(void 0, ctx.cwd));
}

// src/session-title.ts
function registerSessionTitle(_pi) {
  let namingInFlight = false;
  const maybeAutoName = async (userPrompt, ctx) => {
    if (!shouldAutoNameSession(_pi, ctx, userPrompt, namingInFlight)) {
      syncSessionTitleUi(_pi, ctx);
      return;
    }
    namingInFlight = true;
    try {
      const sessionTitle = await generateSessionTitle(ctx, userPrompt);
      if (sessionTitle && !ctx.sessionManager.getSessionName()) {
        _pi.setSessionName(sessionTitle);
      }
    } finally {
      namingInFlight = false;
      syncSessionTitleUi(_pi, ctx);
    }
  };
  _pi.on("session_start", (_event, ctx) => syncSessionTitleUi(_pi, ctx));
  _pi.on("before_agent_start", (event, ctx) => {
    syncSessionTitleUi(_pi, ctx);
    void maybeAutoName(event.prompt, ctx);
  });
  _pi.on("session_tree", (_event, ctx) => syncSessionTitleUi(_pi, ctx));
  _pi.on("agent_end", (_event, ctx) => syncSessionTitleUi(_pi, ctx));
  _pi.on("session_shutdown", (_event, ctx) => clearSessionTitleUi(ctx));
}
export {
  registerSessionTitle as default
};
