// src/summarize.ts
import { completeSimple } from "@mariozechner/pi-ai";

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
  const lastWordBreak = Math.max(clipped.lastIndexOf(" "), clipped.lastIndexOf(":"), clipped.lastIndexOf("-"), clipped.lastIndexOf("\u2014"), clipped.lastIndexOf(","));
  const cutoff = lastWordBreak >= Math.floor(maxLength * 0.6) ? lastWordBreak : maxLength;
  return `${clipped.slice(0, cutoff).trimEnd()}\u2026`;
}
function normalizeTitle(text, maxLength = DEFAULT_MAX_TITLE_LENGTH) {
  const cleaned = collapseWhitespace(stripListPrefix(stripMarkdownNoise(text)));
  if (!cleaned) return void 0;
  const title = truncateTitle(stripWrappingPunctuation(cleaned), maxLength).trim();
  return title || void 0;
}

// src/summarize.ts
var TITLE_PROMPT = [
  "You write short session titles for coding work.",
  "Summarize the user's request instead of copying it.",
  "Return only the title, in the user's language, with no quotes.",
  "Keep it specific, under 8 words, and avoid filler words."
].join(" ");
function isTitleableInput(input) {
  const raw = input.trim();
  return raw.length > 0 && !raw.startsWith("/") && !raw.startsWith("!");
}
function extractText(content) {
  return content.filter((part) => part.type === "text" && typeof part.text === "string").map((part) => part.text).join(" ").trim();
}
async function resolveSessionTitle(input, model, modelRegistry) {
  if (!isTitleableInput(input) || !model) return void 0;
  const auth = await modelRegistry.getApiKeyAndHeaders(model);
  if (!auth.ok) return void 0;
  try {
    const message = await completeSimple(model, {
      systemPrompt: TITLE_PROMPT,
      messages: [{ role: "user", content: input, timestamp: Date.now() }]
    }, {
      apiKey: auth.apiKey,
      headers: auth.headers
    });
    if (message.stopReason === "error") return void 0;
    return normalizeTitle(extractText(message.content));
  } catch {
    return void 0;
  }
}

// src/handlers.ts
function hasUserMessages(ctx) {
  return ctx.sessionManager.getEntries().some((entry) => entry.type === "message" && entry.message?.role === "user");
}
function hasSessionTitle(runtime2, ctx) {
  return Boolean(runtime2.getSessionName() || ctx.sessionManager.getSessionName());
}
function buildTerminalTitle(_cwd, sessionName) {
  return `\u03C0 - ${sessionName}`;
}
function handleInput(pending2, runtime2, event, ctx) {
  if (event.source === "extension" || hasSessionTitle(runtime2, ctx) || hasUserMessages(ctx)) return;
  if (!isTitleableInput(event.text)) return;
  pending2.set(ctx.sessionManager.getSessionId(), event.text);
}
async function handleBeforeAgentStart(pending2, runtime2, ctx) {
  if (hasSessionTitle(runtime2, ctx) || hasUserMessages(ctx)) return;
  const input = pending2.get(ctx.sessionManager.getSessionId());
  if (!input) return;
  const title = await resolveSessionTitle(input, ctx.model, ctx.modelRegistry);
  if (!title) return;
  pending2.delete(ctx.sessionManager.getSessionId());
  runtime2.setSessionName(title);
  if (ctx.hasUI) ctx.ui.setTitle(buildTerminalTitle(ctx.cwd || ctx.sessionManager.getCwd(), title));
}

// src/hooks.ts
var pending = /* @__PURE__ */ new Map();
function runtime(getSessionName, setSessionName) {
  return { getSessionName, setSessionName };
}
function createInputHandler(getSessionName, setSessionName) {
  return async (event, ctx) => {
    handleInput(pending, runtime(getSessionName, setSessionName), event, ctx);
  };
}
function createBeforeAgentStartHandler(getSessionName, setSessionName) {
  return async (_event, ctx) => {
    await handleBeforeAgentStart(pending, runtime(getSessionName, setSessionName), ctx);
  };
}
function createSessionShutdownHandler() {
  return async (_event, ctx) => void pending.delete(ctx.sessionManager.getSessionId());
}

// src/index.ts
function index_default(pi) {
  pi.on("input", createInputHandler(() => pi.getSessionName(), (name) => pi.setSessionName(name)));
  pi.on("before_agent_start", createBeforeAgentStartHandler(() => pi.getSessionName(), (name) => pi.setSessionName(name)));
  pi.on("session_shutdown", createSessionShutdownHandler());
}
export {
  index_default as default
};
