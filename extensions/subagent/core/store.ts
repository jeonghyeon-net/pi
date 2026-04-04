/**
 * Shared state store for the Subagent extension.
 */

import * as os from "node:os";
import type { Message } from "@mariozechner/pi-ai";
import type {
  BatchGroupState,
  CommandRunState,
  DisplayItem,
  GlobalRunEntry,
  PipelineState,
  SingleResult,
} from "./types.js";

export interface SubagentStore {
  commandRuns: Map<number, CommandRunState>;
  globalLiveRuns: Map<number, GlobalRunEntry>;
  renderedRunWidgetIds: Set<number>;
  nextCommandRunId: number;
  commandWidgetCtx: unknown;
  pixelWidgetCtx: unknown;
  sessionStack: string[];
  switchSessionFn: ((sessionPath: string) => Promise<{ cancelled: boolean }>) | null;
  currentParentSessionFile: string | null;
  sessionRunCache: Map<string, CommandRunState[]>;
  currentSessionFile: string | null;
  recentLaunchTimestamps: Map<number, number>;
  batchGroups: Map<string, BatchGroupState>;
  pipelines: Map<string, PipelineState>;
}

export function createStore(): SubagentStore {
  return {
    commandRuns: new Map(),
    globalLiveRuns: new Map(),
    renderedRunWidgetIds: new Set(),
    nextCommandRunId: 1,
    commandWidgetCtx: null,
    pixelWidgetCtx: null,
    sessionStack: [],
    switchSessionFn: null,
    currentParentSessionFile: null,
    sessionRunCache: new Map(),
    currentSessionFile: null,
    recentLaunchTimestamps: new Map(),
    batchGroups: new Map(),
    pipelines: new Map(),
  };
}

// ━━━ Display Items ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function getDisplayItems(messages: Message[]): DisplayItem[] {
  const items: DisplayItem[] = [];
  for (const msg of messages) {
    if (msg.role === "assistant") {
      for (const part of msg.content) {
        if (typeof part === "string") continue;
        if (part.type === "text") items.push({ type: "text", text: part.text });
        else if (part.type === "toolCall")
          items.push({ type: "toolCall", name: part.name, args: part.arguments });
      }
    }
  }
  return items;
}

export function getFinalOutput(messages: Message[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg?.role === "assistant") {
      for (const part of msg.content) {
        if (typeof part !== "string" && part.type === "text" && part.text) return part.text;
      }
    }
  }
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg?.role === "assistant") {
      for (const part of msg.content) {
        if (part.type === "thinking" && part.thinking) return part.thinking;
      }
    }
  }
  return "";
}

export function getLastNonEmptyLine(text: string): string {
  return (
    text
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .pop() ?? ""
  );
}

function resolvePath(primary: unknown, fallback: unknown, defaultVal: string): string {
  const raw = primary || fallback || defaultVal;
  const text = typeof raw === "string" ? raw : String(raw);
  const home = os.homedir();
  return text.startsWith(home) ? `~${text.slice(home.length)}` : text;
}

function formatToolCallPreview(toolName: string, args: Record<string, unknown>): string {
  switch (toolName) {
    case "bash": {
      const c = typeof args.command === "string" && args.command ? args.command : "...";
      return `$ ${c.length > 60 ? `${c.slice(0, 60)}...` : c}`;
    }
    case "read": {
      const fp = resolvePath(args.file_path, args.path, "...");
      const o = typeof args.offset === "number" ? args.offset : undefined;
      const l = typeof args.limit === "number" ? args.limit : undefined;
      if (o !== undefined || l !== undefined) {
        const s = o ?? 1;
        const e = l !== undefined ? s + l - 1 : "";
        return `read ${fp}:${s}${e ? `-${e}` : ""}`;
      }
      return `read ${fp}`;
    }
    case "write": {
      const fp = resolvePath(args.file_path, args.path, "...");
      const c = typeof args.content === "string" ? args.content : "";
      const lines = c.split("\n").length;
      return lines > 1 ? `write ${fp} (${lines} lines)` : `write ${fp}`;
    }
    case "edit":
      return `edit ${resolvePath(args.file_path, args.path, "...")}`;
    case "ls":
      return `ls ${resolvePath(args.path, undefined, ".")}`;
    default: {
      const s = JSON.stringify(args);
      return `${toolName} ${s.length > 50 ? `${s.slice(0, 50)}...` : s}`;
    }
  }
}

export function getLatestActivityPreview(messages: Message[]): string | undefined {
  const items = getDisplayItems(messages);
  const lastItem = items.at(-1);
  if (!lastItem) return undefined;
  if (lastItem.type === "toolCall") {
    return `→ ${formatToolCallPreview(lastItem.name, lastItem.args)}`;
  }
  const line = getLastNonEmptyLine(lastItem.text);
  return line || undefined;
}

// ━━━ Run State Mutations ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function collectToolCallCount(messages: Message[]): number {
  return getDisplayItems(messages).filter((item) => item.type === "toolCall").length;
}

export function updateRunFromResult(state: CommandRunState, result: SingleResult): void {
  const prevToolCalls = state.toolCalls;
  const prevTurnCount = state.turnCount;
  const prevLastLine = state.lastLine;

  state.elapsedMs = Date.now() - state.startedAt;
  state.toolCalls = Math.max(collectToolCallCount(result.messages), result.liveToolCalls ?? 0);
  state.usage = result.usage;
  state.model = result.model ?? state.model;
  if (result.usage?.turns != null) state.turnCount = result.usage.turns;
  if (result.thoughtText) state.thoughtText = result.thoughtText;

  const output = getFinalOutput(result.messages);
  if (output) state.lastOutput = output;

  const previewLine = getLatestActivityPreview(result.messages);
  if (previewLine) {
    state.lastLine = previewLine;
  } else if (result.liveText) {
    const liveLine = getLastNonEmptyLine(result.liveText);
    if (liveLine) state.lastLine = liveLine;
    else if (output) state.lastLine = getLastNonEmptyLine(output);
  } else if (output) {
    state.lastLine = getLastNonEmptyLine(output);
  }

  if (
    state.toolCalls !== prevToolCalls ||
    state.turnCount !== prevTurnCount ||
    state.lastLine !== prevLastLine
  ) {
    state.lastActivityAt = Date.now();
  }
}
