// src/settings.ts
import { existsSync, readFileSync, statSync } from "node:fs";
import path2 from "node:path";

// src/constants.ts
import os from "node:os";
import path from "node:path";
var SETTINGS_REL_PATH = path.join(".claude", "settings.json");
var TRANSCRIPT_TMP_DIR = path.join(os.tmpdir(), "pi-claude-hooks-bridge");
var DEFAULT_HOOK_TIMEOUT_MS = 6e5;
var BUILTIN_TOOL_ALIASES = {
  bash: "Bash",
  read: "Read",
  edit: "Edit",
  write: "Write",
  grep: "Grep",
  find: "Find",
  glob: "Glob",
  ls: "LS"
};

// src/settings.ts
var settingsCache = /* @__PURE__ */ new Map();
function getSettingsPath(cwd) {
  return path2.join(cwd, SETTINGS_REL_PATH);
}
function loadSettings(cwd) {
  const settingsPath = getSettingsPath(cwd);
  if (!existsSync(settingsPath)) return { path: settingsPath, settings: null };
  let mtimeMs = 0;
  try {
    mtimeMs = statSync(settingsPath).mtimeMs;
  } catch {
    return { path: settingsPath, settings: null, parseError: "settings \uD30C\uC77C \uC0C1\uD0DC\uB97C \uC77D\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4." };
  }
  const cached = settingsCache.get(settingsPath);
  if (cached && cached.mtimeMs === mtimeMs) return cached.loaded;
  try {
    const parsed = JSON.parse(readFileSync(settingsPath, "utf8"));
    const settings = typeof parsed === "object" && parsed ? parsed : null;
    const loaded = { path: settingsPath, settings };
    settingsCache.set(settingsPath, { mtimeMs, loaded });
    return loaded;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const loaded = { path: settingsPath, settings: null, parseError: `.claude/settings.json \uD30C\uC2F1 \uC2E4\uD328: ${message}` };
    settingsCache.set(settingsPath, { mtimeMs, loaded });
    return loaded;
  }
}

// src/session-state.ts
var parseErrorNotified = /* @__PURE__ */ new Set();
var stopHookActiveBySession = /* @__PURE__ */ new Map();
var pinnedHookSessionId = null;
function getSessionId(ctx) {
  try {
    return ctx.sessionManager.getSessionId() || "unknown";
  } catch {
    return "unknown";
  }
}
function getHookSessionId(ctx) {
  if (!pinnedHookSessionId) pinnedHookSessionId = getSessionId(ctx);
  return pinnedHookSessionId;
}
function resetSessionState() {
  pinnedHookSessionId = null;
  stopHookActiveBySession.clear();
}
function setSessionStartState(ctx) {
  pinnedHookSessionId = getSessionId(ctx);
  stopHookActiveBySession.set(pinnedHookSessionId, false);
  return pinnedHookSessionId;
}
function getStopHookActive(sessionId) {
  return stopHookActiveBySession.get(sessionId) || false;
}
function setStopHookActive(sessionId, active) {
  stopHookActiveBySession.set(sessionId, active);
}
function shouldNotifyParseError(settingsPath) {
  if (parseErrorNotified.has(settingsPath)) return false;
  parseErrorNotified.add(settingsPath);
  return true;
}

// src/matching.ts
function getHookGroups(settings, eventName) {
  if (!settings?.hooks) return [];
  const groups = settings.hooks[eventName];
  return Array.isArray(groups) ? groups : [];
}
function getClaudeToolName(toolName) {
  return BUILTIN_TOOL_ALIASES[toolName] || toolName;
}
function getMatcherCandidates(toolName) {
  const canonical = getClaudeToolName(toolName);
  return Array.from(/* @__PURE__ */ new Set([toolName, toolName.toLowerCase(), canonical, canonical.toLowerCase()]));
}
function matcherMatches(matcher, toolName) {
  if (!matcher || matcher.trim() === "" || matcher === "*") return true;
  const candidates = getMatcherCandidates(toolName);
  try {
    const re = new RegExp(`^(?:${matcher})$`);
    if (candidates.some((name) => re.test(name))) return true;
  } catch {
  }
  const tokens = matcher.split("|").map((token) => token.trim()).filter(Boolean);
  return tokens.some((token) => candidates.some((name) => name.toLowerCase() === token.toLowerCase()));
}
function getCommandHooks(settings, eventName, toolName) {
  const hooks = [];
  for (const group of getHookGroups(settings, eventName)) {
    if (toolName && !matcherMatches(group.matcher, toolName)) continue;
    if (!Array.isArray(group.hooks)) continue;
    for (const hook of group.hooks) {
      if (hook?.type === "command" && typeof hook.command === "string" && hook.command.trim() !== "") hooks.push(hook);
    }
  }
  return hooks;
}

// src/text.ts
import path3 from "node:path";
function normalizeToolInput(toolName, rawInput, cwd) {
  const input = rawInput && typeof rawInput === "object" ? { ...rawInput } : {};
  const candidate = typeof input.path === "string" ? input.path : typeof input.file_path === "string" ? input.file_path : typeof input.filePath === "string" ? input.filePath : void 0;
  if (candidate) {
    const absolute = path3.isAbsolute(candidate) ? path3.normalize(candidate) : path3.resolve(cwd, candidate);
    input.path = absolute;
    input.file_path = absolute;
    input.filePath = absolute;
  }
  if (toolName === "bash" && typeof input.command !== "string") input.command = "";
  return input;
}
function extractTextFromBlocks(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.flatMap((block) => block && typeof block === "object" && typeof block.text === "string" ? [block.text] : []).join("");
}
function parseJsonFromStdout(stdout) {
  const trimmed = stdout.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
  }
  for (const line of trimmed.split("\n").map((line2) => line2.trim()).filter(Boolean).reverse()) {
    try {
      return JSON.parse(line);
    } catch {
    }
  }
  return null;
}
function fallbackReason(stderr, stdout) {
  const text = stderr.trim() || stdout.trim();
  return !text ? void 0 : text.length > 2e3 ? `${text.slice(0, 2e3)}...` : text;
}
function extractDecision(result) {
  const asObj = result.json && typeof result.json === "object" ? result.json : void 0;
  const hookObj = asObj?.hookSpecificOutput && typeof asObj.hookSpecificOutput === "object" ? asObj.hookSpecificOutput : void 0;
  const decisionRaw = typeof hookObj?.permissionDecision === "string" && hookObj.permissionDecision || typeof asObj?.permissionDecision === "string" && asObj.permissionDecision || typeof hookObj?.decision === "string" && hookObj.decision || typeof asObj?.decision === "string" && asObj.decision || "";
  const reason = typeof hookObj?.permissionDecisionReason === "string" && hookObj.permissionDecisionReason || typeof asObj?.permissionDecisionReason === "string" && asObj.permissionDecisionReason || typeof hookObj?.reason === "string" && hookObj.reason || typeof asObj?.reason === "string" && asObj.reason || fallbackReason(result.stderr, result.stdout);
  const decision = decisionRaw.toLowerCase();
  if (decision === "allow") return { action: "allow", reason };
  if (decision === "ask") return { action: "ask", reason };
  if (decision === "deny" || decision === "block") return { action: "block", reason };
  return result.code === 2 ? { action: "block", reason: reason || "Hook requested block (exit code 2)." } : { action: "none", reason };
}
function toBlockReason(reason, fallback) {
  const text = (reason || "").trim();
  return !text ? fallback : text.length > 2e3 ? `${text.slice(0, 2e3)}...` : text;
}
function trimHookOutput(text) {
  return text.length > 1200 ? `${text.slice(0, 1200)}...` : text;
}

// src/payloads.ts
function makeBasePayload(eventName, ctx) {
  return { hook_event_name: eventName, session_id: getHookSessionId(ctx), cwd: ctx.cwd };
}
function buildPreToolUsePayload(event, ctx) {
  return {
    ...makeBasePayload("PreToolUse", ctx),
    tool_name: getClaudeToolName(event.toolName),
    tool_input: normalizeToolInput(event.toolName, event.input, ctx.cwd),
    tool_use_id: event.toolCallId
  };
}
function buildPostToolUsePayload(event, ctx) {
  return {
    ...makeBasePayload("PostToolUse", ctx),
    tool_name: getClaudeToolName(event.toolName),
    tool_input: normalizeToolInput(event.toolName, event.input, ctx.cwd),
    tool_response: { is_error: Boolean(event.isError), content: event.content, details: event.details },
    tool_use_id: event.toolCallId
  };
}

// src/process.ts
import { spawn } from "node:child_process";
function convertHookTimeoutToMs(timeoutSeconds) {
  return typeof timeoutSeconds === "number" && Number.isFinite(timeoutSeconds) && timeoutSeconds > 0 ? timeoutSeconds * 1e3 : DEFAULT_HOOK_TIMEOUT_MS;
}
async function execCommandHook(command, cwd, payload, timeoutMs) {
  return new Promise((resolve) => {
    const child = spawn("bash", ["-lc", command], { cwd, env: { ...process.env, CLAUDE_PROJECT_DIR: cwd, PWD: cwd }, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "", stderr = "", settled = false, timedOut = false;
    const finish = (code) => {
      if (!settled) {
        settled = true;
        resolve({ command, code, stdout, stderr, timedOut, json: parseJsonFromStdout(stdout) });
      }
    };
    const timer = Number.isFinite(timeoutMs) && timeoutMs > 0 ? setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 1e3);
    }, timeoutMs) : void 0;
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      if (timer) clearTimeout(timer);
      stderr += `
${error instanceof Error ? error.message : String(error)}`;
      finish(1);
    });
    child.on("close", (code) => {
      if (timer) clearTimeout(timer);
      finish(typeof code === "number" ? code : 1);
    });
    try {
      child.stdin.write(`${JSON.stringify(payload)}
`);
      child.stdin.end();
    } catch (error) {
      stderr += `
stdin write failed: ${error instanceof Error ? error.message : String(error)}`;
      finish(1);
    }
  });
}
async function runHooks(settings, eventName, ctx, payload, toolName) {
  const hooks = getCommandHooks(settings, eventName, toolName);
  const results = [];
  for (const hook of hooks) results.push(await execCommandHook(hook.command, ctx.cwd, payload, convertHookTimeoutToMs(hook.timeout)));
  return results;
}

// src/notifications.ts
function notifyOnceForParseError(ctx, loaded) {
  if (!loaded.parseError || !ctx.hasUI || !shouldNotifyParseError(loaded.path)) return;
  ctx.ui.notify(`[claude-hooks-bridge] ${loaded.parseError}`, "warning");
}
function notifySessionStartHookResult(ctx, result) {
  if (!ctx.hasUI) return;
  const out = result.stdout.trim();
  const err = result.stderr.trim();
  if (out) ctx.ui.notify(`[claude-hooks-bridge:SessionStart]
${trimHookOutput(out)}`, "info");
  if (err) ctx.ui.notify(`[claude-hooks-bridge:SessionStart stderr]
${trimHookOutput(err)}`, "warning");
}

// src/transcript.ts
import { mkdirSync, writeFileSync } from "node:fs";
import path4 from "node:path";
function getLastAssistantMessage(ctx) {
  const entries = ctx.sessionManager.getEntries();
  for (let i = entries.length - 1; i >= 0; i -= 1) {
    const entry = entries[i];
    if (entry?.type === "message" && entry.message.role === "assistant") {
      const text = extractTextFromBlocks(entry.message.content);
      if (text) return text;
    }
  }
}
function mapAssistant(content) {
  return content.flatMap((block) => {
    if (block.type === "text") return [{ type: "text", text: block.text }];
    if (block.type === "toolCall") return [{ type: "tool_use", id: block.id, name: block.name, input: block.arguments }];
    return [];
  });
}
function mapUser(content) {
  if (!Array.isArray(content)) return [];
  return content.flatMap((block) => block?.type === "text" ? [{ type: "text", text: block.text }] : []);
}
function mapTranscriptLine(entry) {
  const message = entry.message;
  if (message.role === "assistant") {
    const content = Array.isArray(message.content) ? mapAssistant(message.content) : [];
    return content.length ? JSON.stringify({ type: "assistant", message: { content } }) : null;
  }
  if (message.role === "user") {
    const content = mapUser(message.content);
    return content.length ? JSON.stringify({ type: "user", message: { content } }) : null;
  }
  if (message.role !== "toolResult") return null;
  return JSON.stringify({ type: "user", message: { content: [{ type: "tool_result", tool_use_id: message.toolCallId, content: [{ type: "text", text: extractTextFromBlocks(message.content) }] }] } });
}
function createTranscriptFile(ctx, sessionId) {
  try {
    const lines = ctx.sessionManager.getEntries().flatMap((entry) => entry?.type === "message" ? [mapTranscriptLine(entry)] : []).filter(Boolean);
    mkdirSync(TRANSCRIPT_TMP_DIR, { recursive: true });
    const file = path4.join(TRANSCRIPT_TMP_DIR, `${sessionId.replace(/[^a-zA-Z0-9_-]/g, "_")}.jsonl`);
    writeFileSync(file, lines.length ? `${lines.join("\n")}
` : "", "utf8");
    return file;
  } catch {
    return void 0;
  }
}

// src/bridge.ts
async function handleSessionStart(event, ctx) {
  const sessionId = setSessionStartState(ctx);
  if (event.reason === "resume" || event.reason === "fork") return;
  const loaded = loadSettings(ctx.cwd);
  notifyOnceForParseError(ctx, loaded);
  for (const result of await runHooks(loaded.settings, "SessionStart", ctx, makeBasePayload("SessionStart", ctx))) {
    notifySessionStartHookResult(ctx, result);
  }
  setStopHookActive(sessionId, false);
}
function bridge_default(pi) {
  pi.on("session_start", async (event, ctx) => {
    await handleSessionStart(event, ctx);
  });
  pi.on("session_shutdown", async () => {
    resetSessionState();
  });
  pi.on("before_agent_start", async (event, ctx) => {
    const loaded = loadSettings(ctx.cwd);
    notifyOnceForParseError(ctx, loaded);
    await runHooks(loaded.settings, "UserPromptSubmit", ctx, { ...makeBasePayload("UserPromptSubmit", ctx), prompt: event.prompt });
  });
  pi.on("tool_call", async (event, ctx) => {
    const loaded = loadSettings(ctx.cwd);
    notifyOnceForParseError(ctx, loaded);
    for (const result of await runHooks(loaded.settings, "PreToolUse", ctx, buildPreToolUsePayload(event, ctx), event.toolName)) {
      const decision = extractDecision(result);
      if (decision.action === "ask") {
        const reason = toBlockReason(decision.reason, "Hook requested permission.");
        if (!ctx.hasUI) return { block: true, reason: `Blocked (no UI): ${reason}` };
        if (!await ctx.ui.confirm("Claude hook permission", reason)) return { block: true, reason: toBlockReason(decision.reason, "Blocked by user confirmation from .claude hook.") };
      }
      if (decision.action === "block") return { block: true, reason: toBlockReason(decision.reason, "Blocked by .claude PreToolUse hook.") };
    }
  });
  pi.on("tool_result", async (event, ctx) => {
    const loaded = loadSettings(ctx.cwd);
    notifyOnceForParseError(ctx, loaded);
    await runHooks(loaded.settings, "PostToolUse", ctx, buildPostToolUsePayload(event, ctx), event.toolName);
  });
  pi.on("agent_end", async (_event, ctx) => {
    const loaded = loadSettings(ctx.cwd);
    notifyOnceForParseError(ctx, loaded);
    const sessionId = getHookSessionId(ctx);
    const payload = { ...makeBasePayload("Stop", ctx), stop_hook_active: getStopHookActive(sessionId) };
    const transcriptPath = createTranscriptFile(ctx, sessionId);
    const lastAssistantMessage = getLastAssistantMessage(ctx);
    if (transcriptPath) payload.transcript_path = transcriptPath;
    if (lastAssistantMessage) payload.last_assistant_message = lastAssistantMessage;
    let blockedReason;
    for (const result of await runHooks(loaded.settings, "Stop", ctx, payload)) {
      const decision = extractDecision(result);
      if (decision.action === "block") blockedReason = toBlockReason(decision.reason, "Stop hook blocked completion. Continue the remaining work before finishing.");
    }
    if (!blockedReason) return void setStopHookActive(sessionId, false);
    if (!getStopHookActive(sessionId)) {
      setStopHookActive(sessionId, true);
      pi.sendUserMessage(blockedReason, { deliverAs: "followUp" });
      if (ctx.hasUI) ctx.ui.notify("[claude-hooks-bridge] Stop hook blocked end and queued follow-up.", "info");
      return;
    }
    setStopHookActive(sessionId, false);
    if (ctx.hasUI) ctx.ui.notify(`[claude-hooks-bridge] Stop hook blocked again (loop guard): ${blockedReason}`, "warning");
  });
}
export {
  bridge_default as default
};
