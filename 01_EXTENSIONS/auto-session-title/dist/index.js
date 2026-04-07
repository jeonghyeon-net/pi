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
      headers: auth.headers,
      maxTokens: 24,
      reasoning: "minimal"
    });
    return normalizeTitle(extractText(message.content));
  } catch {
    return void 0;
  }
}

// src/handlers.ts
function hasUserMessages(ctx) {
  return ctx.sessionManager.getEntries().some((entry) => entry.type === "message" && entry.message?.role === "user");
}
function buildTerminalTitle(_cwd, sessionName) {
  return `\u03C0 - ${sessionName}`;
}
async function handleInput(runtime, event, ctx) {
  if (event.source === "extension") return;
  if (runtime.getSessionName() || ctx.sessionManager.getSessionName()) return;
  if (hasUserMessages(ctx)) return;
  const title = await resolveSessionTitle(event.text, ctx.model, ctx.modelRegistry);
  if (!title) return;
  runtime.setSessionName(title);
  if (ctx.hasUI) ctx.ui.setTitle(buildTerminalTitle(ctx.cwd || ctx.sessionManager.getCwd(), title));
}

// src/index.ts
function index_default(pi) {
  pi.on("input", async (event, ctx) => handleInput({ getSessionName: () => pi.getSessionName(), setSessionName: (name) => pi.setSessionName(name) }, event, ctx));
}
export {
  index_default as default
};
