import type {
  ExtensionContext,
  ToolCallEvent,
  ToolResultEvent,
} from "@mariozechner/pi-coding-agent";
import { convertHookTimeoutToMs } from "./decision.js";
import { execCommandHook } from "./exec.js";
import { getClaudeToolName, getCommandHooks } from "./matcher.js";
import { normalizeToolInput } from "./normalize.js";
import { getHookSessionId } from "./session.js";
import type { ClaudeHookEventName, ClaudeSettings, HookExecResult, JsonRecord } from "./types.js";

export function makeBasePayload(eventName: ClaudeHookEventName, ctx: ExtensionContext): JsonRecord {
  return {
    hook_event_name: eventName,
    session_id: getHookSessionId(ctx),
    cwd: ctx.cwd,
  };
}

export function buildPreToolUsePayload(event: ToolCallEvent, ctx: ExtensionContext): JsonRecord {
  const toolInput = normalizeToolInput(event.toolName, event.input as unknown, ctx.cwd);
  return {
    ...makeBasePayload("PreToolUse", ctx),
    tool_name: getClaudeToolName(event.toolName),
    tool_input: toolInput,
    tool_use_id: event.toolCallId,
  };
}

export function buildPostToolUsePayload(event: ToolResultEvent, ctx: ExtensionContext): JsonRecord {
  const toolInput = normalizeToolInput(event.toolName, event.input as unknown, ctx.cwd);
  return {
    ...makeBasePayload("PostToolUse", ctx),
    tool_name: getClaudeToolName(event.toolName),
    tool_input: toolInput,
    tool_response: {
      is_error: Boolean(event.isError),
      content: event.content,
      details: event.details,
    },
    tool_use_id: event.toolCallId,
  };
}

export async function runHooks(
  settings: ClaudeSettings | null,
  eventName: ClaudeHookEventName,
  ctx: ExtensionContext,
  payload: JsonRecord,
  toolNameForMatcher?: string,
): Promise<HookExecResult[]> {
  const hooks = getCommandHooks(settings, eventName, toolNameForMatcher);
  if (hooks.length === 0) return [];

  const results: HookExecResult[] = [];

  for (const hook of hooks) {
    // getCommandHooks() guarantees hook.command is a non-empty string.
    const command = hook.command as string;
    const timeoutMs = convertHookTimeoutToMs(hook.timeout);
    const result = await execCommandHook(command, ctx.cwd, payload, timeoutMs);
    results.push(result);
  }

  return results;
}
