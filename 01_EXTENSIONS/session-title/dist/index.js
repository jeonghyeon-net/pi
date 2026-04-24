// src/title-context.ts
var MAX_CONTEXT_TEXT_CHARS = 280;
var MAX_RECENT_USER_PROMPTS = 3;
function clipContextText(text) {
  if (text.length <= MAX_CONTEXT_TEXT_CHARS) return text;
  return `${text.slice(0, MAX_CONTEXT_TEXT_CHARS - 1).trimEnd()}\u2026`;
}
function normalizeContextText(text) {
  return clipContextText(text.replace(/[\r\n\t]+/gu, " ").replace(/\s+/gu, " ").trim());
}
function extractMessageText(message) {
  if (!message) return "";
  if (typeof message.content === "string") return normalizeContextText(message.content);
  if (!Array.isArray(message.content)) return "";
  return normalizeContextText(
    message.content.filter((part) => !!part && typeof part === "object").map((part) => part.type === "text" && typeof part.text === "string" ? part.text : "").join(" ")
  );
}
function getSessionEntries(sessionManager) {
  if (typeof sessionManager.getBranch === "function") return sessionManager.getBranch();
  if (typeof sessionManager.getEntries === "function") return sessionManager.getEntries();
  return [];
}
function pushUniqueText(items, value) {
  if (!value) return;
  if (items.includes(value)) return;
  items.push(value);
}
function extractSessionTitleContext(sessionManager, currentTitle, pendingUserPrompt) {
  const userPrompts = [];
  let latestAssistantText = "";
  for (const entry of getSessionEntries(sessionManager)) {
    if (entry?.type !== "message") continue;
    const role = entry.message?.role;
    const text = extractMessageText(entry.message);
    if (!text) continue;
    if (role === "user") pushUniqueText(userPrompts, text);
    if (role === "assistant") latestAssistantText = text;
  }
  pushUniqueText(userPrompts, normalizeContextText(pendingUserPrompt ?? ""));
  return {
    currentTitle: currentTitle?.trim() || void 0,
    firstUserPrompt: userPrompts[0] ?? "",
    recentUserPrompts: userPrompts.slice(-MAX_RECENT_USER_PROMPTS),
    latestAssistantText
  };
}
function buildFallbackSourceFromContext(context) {
  return [context.recentUserPrompts.at(-1), context.firstUserPrompt, context.latestAssistantText].filter((value) => !!value).join("\n");
}

// src/title-generator.ts
import { completeSimple } from "@mariozechner/pi-ai";

// src/title-format.ts
import * as path from "node:path";
var MAX_PROMPT_CHARS = 800;
var MAX_TITLE_CHARS = 48;
var MAX_TERMINAL_TITLE_CHARS = 60;
var TITLE_SYSTEM_PROMPT = [
  "You write short, explicit session titles for a coding task.",
  "Preserve the user's language. If the request contains Korean, write the title in Korean.",
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
  return text.startsWith(open) && text.endsWith(close) && text.length > open.length + close.length ? text.slice(open.length, text.length - close.length).trim() : text;
}
function prefersKoreanTitle(text) {
  return /[가-힣]/u.test(text);
}
function titleMatchesPreferredLanguage(title, sourceText) {
  return !prefersKoreanTitle(sourceText) || prefersKoreanTitle(title);
}
function buildTitleLanguageInstruction(sourceText) {
  return prefersKoreanTitle(sourceText) ? "Title language: Korean. Write the summary in Korean; keep product names, model names, and code identifiers as-is." : "Title language: Preserve the user's language.";
}
function buildTitlePrompt(userPrompt) {
  return `${buildTitleLanguageInstruction(userPrompt)}

User request:
${userPrompt.slice(0, MAX_PROMPT_CHARS)}`;
}
function buildContextTitlePrompt(context) {
  const languageInstruction = buildTitleLanguageInstruction([context.firstUserPrompt, ...context.recentUserPrompts].filter(Boolean).join("\n"));
  const sections = [
    context.currentTitle ? `Current session title:
${context.currentTitle.slice(0, MAX_PROMPT_CHARS)}` : "",
    context.firstUserPrompt ? `Initial user request:
${context.firstUserPrompt.slice(0, MAX_PROMPT_CHARS)}` : "",
    context.recentUserPrompts.length > 0 ? `Recent user follow-ups:
${context.recentUserPrompts.map((prompt) => `- ${prompt.slice(0, MAX_PROMPT_CHARS)}`).join("\n")}` : "",
    context.latestAssistantText ? `Latest assistant progress:
${context.latestAssistantText.slice(0, MAX_PROMPT_CHARS)}` : ""
  ].filter(Boolean).join("\n\n");
  return sections ? `${languageInstruction}

Session context:
${sections}` : `${languageInstruction}

Session context:`;
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
var ACTION_LEAD_RE = /^(add|fix|update|implement|create|make|write|refactor|remove|support|improve|enable|simplify|document|rename|move|review|debug|test|investigate|build|convert|ship)\b/iu;
function comparisonText(text) {
  return text.toLowerCase().replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/gu, "$1").replace(/https?:\/\/\S+/gu, " ").replace(/[^\p{L}\p{N}]+/gu, " ").replace(/\s+/gu, " ").trim();
}
function looksLikePromptCopy(title, userPrompt) {
  const normalizedTitle = comparisonText(normalizeTitle(title));
  const normalizedPrompt = comparisonText(userPrompt);
  if (!normalizedTitle || !normalizedPrompt) return false;
  if (normalizedPrompt === normalizedTitle || normalizedPrompt.startsWith(normalizedTitle) || normalizedTitle.startsWith(normalizedPrompt)) return true;
  const promptTokens = normalizedPrompt.split(" ");
  const titleTokens = normalizedTitle.split(" ");
  const overlap = titleTokens.filter((token) => promptTokens.includes(token)).length;
  return titleTokens.length >= 3 && ACTION_LEAD_RE.test(normalizedTitle) && overlap / titleTokens.length >= 0.85;
}
function isClearSummaryTitle(title) {
  const normalized = normalizeTitle(title);
  return normalized.length > 0 && !REQUEST_NOISE_RE.test(normalized) && !/[?？]/u.test(normalized);
}
function formatTerminalTitle(title, cwd) {
  const projectName = path.basename(cwd) || "pi";
  const clippedTitle = title ? clip(title.replace(/\s+/gu, " ").trim(), MAX_TERMINAL_TITLE_CHARS) : void 0;
  return clippedTitle ? `\u03C0 - ${clippedTitle} - ${projectName}` : `\u03C0 - ${projectName}`;
}

// src/comparison-title.ts
function cleanComparisonSide(text) {
  return text.replace(/[?？]+$/gu, "").replace(/\s*(?:누가\s*더\s*좋(?:음|아|냐|을까|은지)?|어느\s*(?:쪽|게)?\s*더\s*낫(?:냐|나|지|을까)?|뭐가\s*더\s*낫(?:냐|나|지|을까)?|어떤\s*게\s*더\s*좋(?:음|아|냐|을까)?|비교|차이|장단점|리뷰|후기|평가|반응|레딧).*$/u, "").replace(/\s*(?:which\s+is\s+better|which\s+one\s+is\s+better|better|compare|comparison|differences?|pros\s+and\s+cons|user\s+reviews?|reviews?|reddit|레딧).*$/iu, "").trim();
}
function summarizeComparisonPrompt(text, stripRequestFraming2) {
  const trimmed = stripRequestFraming2(text).replace(/\s+/gu, " ").trim();
  if (!trimmed || !/(?:\bvs\b|versus)/iu.test(trimmed)) return "";
  const match = trimmed.match(/(.+?)\s+(?:vs\.?|versus)\s+(.+)/iu);
  if (!match) return "";
  const left = cleanComparisonSide(match[1]);
  const right = cleanComparisonSide(match[2]);
  if (!left || !right) return "";
  const korean = /[가-힣]/u.test(trimmed);
  const hasReddit = /(reddit|레딧)/iu.test(trimmed);
  const hasReview = /(review|reviews|리뷰|후기|평가|반응)/iu.test(trimmed);
  const suffix = hasReddit ? korean ? "\uB808\uB527 \uB9AC\uBDF0 \uBE44\uAD50" : "Reddit review comparison" : hasReview ? korean ? "\uB9AC\uBDF0 \uBE44\uAD50" : "review comparison" : korean ? "\uBE44\uAD50" : "comparison";
  return normalizeTitle(`${left} vs ${right} ${suffix}`);
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
function condenseActionPhrase(text) {
  const english = text.match(/^(add|fix|update|implement|create|make|write|refactor|remove|support|improve|enable|simplify|document|rename|move|review|debug|test|investigate|convert|build|ship)\s+(.+)/iu);
  return english?.[2]?.trim() || text;
}
function summarizeHowToPrompt(text) {
  const trimmed = stripRequestFraming(text).replace(/[?？]+$/gu, "").trim();
  if (!trimmed) return "";
  const koreanRules = [
    { pattern: /\s*(?:쓰려면|사용하려면)(?:\s*어떻게\s*(?:해야(?:함|해|하나|하나요|하냐|할까)?|함)|\s*방법)?\s*$/u, suffix: "\uC0AC\uC6A9 \uBC29\uBC95" },
    { pattern: /\s*(?:설정하려면|설정은?)(?:\s*어떻게\s*(?:해야(?:함|해|하나|하나요|하냐|할까)?|함)|\s*방법)?\s*$/u, suffix: "\uC124\uC815 \uBC29\uBC95" },
    { pattern: /\s*(?:설치하려면|깔려면)(?:\s*어떻게\s*(?:해야(?:함|해|하나|하나요|하냐|할까)?|함)|\s*방법)?\s*$/u, suffix: "\uC124\uCE58 \uBC29\uBC95" },
    { pattern: /\s*(?:연결하려면)(?:\s*어떻게\s*(?:해야(?:함|해|하나|하나요|하냐|할까)?|함)|\s*방법)?\s*$/u, suffix: "\uC5F0\uACB0 \uBC29\uBC95" }
  ];
  for (const { pattern, suffix } of koreanRules) {
    if (pattern.test(trimmed)) return normalizeTitle(trimmed.replace(pattern, ` ${suffix}`));
  }
  const englishRules = [
    { pattern: /^(?:how (?:do|can) i\s+|how to\s+)(use\s+.+)$/iu, prefix: "" },
    { pattern: /^(?:how (?:do|can) i\s+|how to\s+)(configure\s+.+)$/iu, prefix: "" },
    { pattern: /^(?:how (?:do|can) i\s+|how to\s+)(install\s+.+)$/iu, prefix: "" },
    { pattern: /^(?:how (?:do|can) i\s+|how to\s+)(connect\s+.+)$/iu, prefix: "" }
  ];
  for (const { pattern, prefix } of englishRules) {
    const match = trimmed.match(pattern);
    if (match?.[1]) return normalizeTitle(`${prefix}${match[1]}`.trim());
  }
  const genericQuestion = trimmed.replace(/\s*(?:어떻게\s*(?:해야(?:함|해|하나|하나요|하냐|할까)?|함)|방법|가능(?:함|해|한가|할까)?|되나|됨|돼|되냐|될까|뭐임|뭐야)\s*$/u, "").replace(/\s*(?:how (?:do|can) i|how to|what is|what's)\s+/iu, "").trim();
  if (genericQuestion && genericQuestion !== trimmed) {
    return normalizeTitle(/[가-힣]/u.test(trimmed) ? `${genericQuestion} \uAD00\uB828 \uC9C8\uBB38` : `${genericQuestion} question`);
  }
  return "";
}
function buildNonCopyTitle(text) {
  const topic = stripRequestFraming(text).replace(/[?？]+$/gu, "").replace(/\s*(?:어떻게\s*(?:해야(?:함|해|하나|하나요|하냐|할까)?|함)|방법|가능(?:함|해|한가|할까)?|되나|됨|돼|되냐|될까|뭐임|뭐야)\s*$/u, "").replace(/\b(?:please|can you|could you|would you|help me|i need you to|how do i|how can i|how to|what is|what's)\b/giu, " ").replace(/\s+/gu, " ").trim();
  if (!topic) return /[가-힣]/u.test(text) ? "\uC0C8 \uC138\uC158" : "new session";
  return normalizeTitle(/[가-힣]/u.test(topic) ? `${topic} \uAD00\uB828 \uC791\uC5C5` : `${topic} task`);
}
function summarizeKnownTask(text) {
  const korean = /[가-힣]/u.test(text);
  const suffix = /\bextensions?\b/iu.test(text) || /extensions?에/u.test(text) ? korean ? " \uD655\uC7A5" : " extension" : "";
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
  const comparisonSummary = summarizeComparisonPrompt(cleaned, stripRequestFraming);
  if (comparisonSummary) return comparisonSummary;
  const questionSummary = summarizeHowToPrompt(cleaned);
  if (questionSummary) return questionSummary;
  const parts = cleaned.split(/[\n\r]+|(?<=[.!?。！？])\s+/u).map((part) => stripRequestFraming(part)).filter(Boolean);
  const candidate = parts.find((part) => part.length >= 4) ?? stripRequestFraming(cleaned);
  const normalized = normalizeTitle(condenseActionPhrase(candidate));
  return looksLikePromptCopy(normalized, userPrompt) ? buildNonCopyTitle(cleaned) : normalized;
}

// src/title-generator.ts
function buildFallbackTitleFromInput(input) {
  return buildFallbackTitle(typeof input === "string" ? input : buildFallbackSourceFromContext(input));
}
function buildModelPrompt(input) {
  return typeof input === "string" ? buildTitlePrompt(input) : buildContextTitlePrompt(input);
}
function buildLanguageSourceFromInput(input) {
  return typeof input === "string" ? input : [input.firstUserPrompt, ...input.recentUserPrompts].filter(Boolean).join("\n");
}
function looksLikeInputCopy(title, input) {
  if (typeof input === "string") return looksLikePromptCopy(title, input);
  return [input.firstUserPrompt, ...input.recentUserPrompts].filter(Boolean).some((prompt) => looksLikePromptCopy(title, prompt));
}
async function generateSessionTitle(ctx, input) {
  const fallbackTitle = buildFallbackTitleFromInput(input);
  if (!ctx.model || !ctx.modelRegistry) return fallbackTitle;
  const auth = await ctx.modelRegistry.getApiKeyAndHeaders(ctx.model).catch(() => void 0);
  if (!auth?.ok) return fallbackTitle;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 1e4);
  const result = await completeSimple(
    ctx.model,
    { systemPrompt: TITLE_SYSTEM_PROMPT, messages: [{ role: "user", content: [{ type: "text", text: buildModelPrompt(input) }], timestamp: Date.now() }] },
    { apiKey: auth.apiKey, headers: auth.headers, signal: controller.signal, reasoning: "minimal", maxTokens: 80 }
  ).catch(() => void 0);
  clearTimeout(timeoutId);
  if (!result || result.stopReason !== "stop") return fallbackTitle;
  const generatedTitle = normalizeTitle(extractTextContent(result.content));
  return isClearSummaryTitle(generatedTitle) && titleMatchesPreferredLanguage(generatedTitle, buildLanguageSourceFromInput(input)) && !looksLikeInputCopy(generatedTitle, input) ? generatedTitle : fallbackTitle;
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
function shouldReplaceSessionTitle(currentTitle, userPrompt) {
  if (!currentTitle?.trim()) return true;
  if (!userPrompt.trim()) return false;
  return looksLikePromptCopy(currentTitle, userPrompt);
}
function shouldAutoNameSession(pi, ctx, userPrompt, namingInFlight) {
  if (namingInFlight) return false;
  if (!userPrompt.trim()) return false;
  if (isSubagentSessionPath(extractSessionFilePath(ctx.sessionManager))) return false;
  return shouldReplaceSessionTitle(getSessionTitle(pi, ctx), userPrompt);
}

// src/session-title-ui.ts
function syncSessionTitleUi(pi, ctx) {
  if (!ctx.hasUI) return;
  ctx.ui.setTitle(formatTerminalTitle(getSessionTitle(pi, ctx), ctx.cwd));
}
function clearSessionTitleUi(ctx) {
  if (!ctx.hasUI) return;
  ctx.ui.setTitle(formatTerminalTitle(void 0, ctx.cwd));
}

// src/session-title.ts
function registerSessionTitle(_pi) {
  let namingInFlight = false;
  const maybeUpdateTitle = async (ctx, input, shouldApply) => {
    namingInFlight = true;
    try {
      const sessionTitle = await generateSessionTitle(ctx, input);
      const currentTitle = getSessionTitle(_pi, ctx);
      if (sessionTitle && sessionTitle !== currentTitle && shouldApply(currentTitle)) {
        _pi.setSessionName(sessionTitle);
      }
    } finally {
      namingInFlight = false;
      syncSessionTitleUi(_pi, ctx);
    }
  };
  const maybeAutoNameFromPrompt = async (userPrompt, ctx) => {
    const context = extractSessionTitleContext(ctx.sessionManager, getSessionTitle(_pi, ctx), userPrompt);
    const firstPrompt = context.firstUserPrompt || userPrompt;
    if (!shouldAutoNameSession(_pi, ctx, firstPrompt, namingInFlight)) {
      syncSessionTitleUi(_pi, ctx);
      return;
    }
    await maybeUpdateTitle(ctx, firstPrompt, (currentTitle) => shouldReplaceSessionTitle(currentTitle, firstPrompt));
  };
  const runTitleUpdateInBackground = (ctx, task) => {
    void task.catch(() => syncSessionTitleUi(_pi, ctx));
  };
  _pi.on("session_start", (_event, ctx) => syncSessionTitleUi(_pi, ctx));
  _pi.on("before_agent_start", (event, ctx) => runTitleUpdateInBackground(ctx, maybeAutoNameFromPrompt(event.prompt, ctx)));
  _pi.on("session_tree", (_event, ctx) => syncSessionTitleUi(_pi, ctx));
  _pi.on("agent_end", (_event, ctx) => syncSessionTitleUi(_pi, ctx));
  _pi.on("session_shutdown", (_event, ctx) => clearSessionTitleUi(ctx));
}
export {
  registerSessionTitle as default
};
