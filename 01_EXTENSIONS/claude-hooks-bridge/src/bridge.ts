import { loadSettings } from "./settings.js";
import { buildPostToolUsePayload, buildPreToolUsePayload, makeBasePayload } from "./payloads.js";
import { runHooks } from "./process.js";
import { notifyOnceForParseError, notifySessionStartHookResult } from "./notifications.js";
import { createTranscriptFile, getLastAssistantMessage } from "./transcript.js";
import { extractDecision, toBlockReason } from "./text.js";
import { getHookSessionId, getStopHookActive, resetSessionState, setSessionStartState, setStopHookActive } from "./session-state.js";
import type { JsonRecord, PiApiLike, RuntimeContextLike, ToolCallEventLike, ToolResultEventLike } from "./types.js";

async function handleSessionStart(event: { reason?: string }, ctx: RuntimeContextLike): Promise<void> {
  const sessionId = setSessionStartState(ctx);
  if (event.reason === "resume" || event.reason === "fork") return;
  const loaded = loadSettings(ctx.cwd);
  notifyOnceForParseError(ctx, loaded);
  for (const result of await runHooks(loaded.settings, "SessionStart", ctx, makeBasePayload("SessionStart", ctx))) {
    notifySessionStartHookResult(ctx, result);
  }
  setStopHookActive(sessionId, false);
}

export default function (pi: PiApiLike) {
  pi.on("session_start", async (event, ctx) => { await handleSessionStart(event, ctx); });
  pi.on("session_shutdown", async () => { resetSessionState(); });
  pi.on("before_agent_start", async (event, ctx) => {
    const loaded = loadSettings(ctx.cwd);
    notifyOnceForParseError(ctx, loaded);
    await runHooks(loaded.settings, "UserPromptSubmit", ctx, { ...makeBasePayload("UserPromptSubmit", ctx), prompt: event.prompt });
  });
  pi.on("tool_call", async (event: ToolCallEventLike, ctx): Promise<{ block: boolean; reason: string } | undefined> => {
    const loaded = loadSettings(ctx.cwd);
    notifyOnceForParseError(ctx, loaded);
    for (const result of await runHooks(loaded.settings, "PreToolUse", ctx, buildPreToolUsePayload(event, ctx), event.toolName)) {
      const decision = extractDecision(result);
      if (decision.action === "ask") {
        const reason = toBlockReason(decision.reason, "Hook requested permission.");
        if (!ctx.hasUI) return { block: true, reason: `Blocked (no UI): ${reason}` };
        if (!(await ctx.ui.confirm("Claude hook permission", reason))) return { block: true, reason: toBlockReason(decision.reason, "Blocked by user confirmation from .claude hook.") };
      }
      if (decision.action === "block") return { block: true, reason: toBlockReason(decision.reason, "Blocked by .claude PreToolUse hook.") };
    }
  });
  pi.on("tool_result", async (event: ToolResultEventLike, ctx) => {
    const loaded = loadSettings(ctx.cwd);
    notifyOnceForParseError(ctx, loaded);
    await runHooks(loaded.settings, "PostToolUse", ctx, buildPostToolUsePayload(event, ctx), event.toolName);
  });
  pi.on("agent_end", async (_event, ctx) => {
    const loaded = loadSettings(ctx.cwd);
    notifyOnceForParseError(ctx, loaded);
    const sessionId = getHookSessionId(ctx);
    const payload: JsonRecord = { ...makeBasePayload("Stop", ctx), stop_hook_active: getStopHookActive(sessionId) };
    const transcriptPath = createTranscriptFile(ctx, sessionId);
    const lastAssistantMessage = getLastAssistantMessage(ctx);
    if (transcriptPath) payload.transcript_path = transcriptPath;
    if (lastAssistantMessage) payload.last_assistant_message = lastAssistantMessage;
    let blockedReason: string | undefined;
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
