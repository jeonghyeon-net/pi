// @ts-nocheck — forked from Jonghakseo/my-pi
/**
 * Formatting utilities — tokens, usage, tool calls, context bars.
 */

import * as os from "node:os";
import type { ThemeColor } from "@mariozechner/pi-coding-agent";
import { visibleWidth } from "@mariozechner/pi-tui";
import { AGENT_NAME_PALETTE } from "./types.js";

// ━━━ Text ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const graphemeSegmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });

function sliceToDisplayWidth(value: string, maxWidth: number): string {
  if (maxWidth <= 0 || value.length === 0) return "";
  let result = "";
  let width = 0;
  for (const { segment } of graphemeSegmenter.segment(value)) {
    const segmentWidth = visibleWidth(segment);
    if (segmentWidth <= 0) {
      result += segment;
      continue;
    }
    if (width + segmentWidth > maxWidth) break;
    result += segment;
    width += segmentWidth;
  }
  return result;
}

export function truncateText(value: string, max: number): string {
  if (max <= 0 || value.length === 0) return "";
  if (visibleWidth(value) <= max) return value;
  if (max <= 3) return sliceToDisplayWidth(value, max);
  return `${sliceToDisplayWidth(value, max - 3)}...`;
}

export function truncateToWidthWithEllipsis(value: string, maxWidth: number): string {
  if (maxWidth <= 0) return "";
  if (visibleWidth(value) <= maxWidth) return value;
  if (maxWidth <= 3) return sliceToDisplayWidth(value, maxWidth);
  return `${sliceToDisplayWidth(value, maxWidth - 3)}...`;
}

export function truncateLines(text: string, maxLines = 2): string {
  const lines = text.split("\n");
  if (lines.length <= maxLines) return text;
  return `${lines.slice(0, maxLines).join("\n")}\n...`;
}

// ━━━ Tokens / Usage ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function formatTokens(count: number): string {
  if (count < 1000) return count.toString();
  if (count < 10000) return `${(count / 1000).toFixed(1)}k`;
  if (count < 1000000) return `${Math.round(count / 1000)}k`;
  return `${(count / 1000000).toFixed(1)}M`;
}

export function formatUsageStats(
  usage: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
    cost: number;
    contextTokens?: number;
    turns?: number;
  },
  model?: string,
): string {
  const parts: string[] = [];
  if (usage.turns) parts.push(`${usage.turns} turn${usage.turns > 1 ? "s" : ""}`);
  if (usage.input) parts.push(`↑${formatTokens(usage.input)}`);
  if (usage.output) parts.push(`↓${formatTokens(usage.output)}`);
  if (usage.cacheRead) parts.push(`R${formatTokens(usage.cacheRead)}`);
  if (usage.cacheWrite) parts.push(`W${formatTokens(usage.cacheWrite)}`);
  if (usage.cost) parts.push(`$${usage.cost.toFixed(4)}`);
  if (usage.contextTokens && usage.contextTokens > 0)
    parts.push(`ctx:${formatTokens(usage.contextTokens)}`);
  if (model) parts.push(model);
  return parts.join(" ");
}

// ━━━ Context Bar ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function normalizeModelRef(modelRef: string): { provider?: string; id: string } {
  const cleaned = modelRef.trim().split(":")[0] ?? modelRef.trim();
  if (cleaned.includes("/")) {
    const [provider, ...idParts] = cleaned.split("/");
    return { provider, id: idParts.join("/") };
  }
  return { id: cleaned };
}

type ContextWindowResolverContext = {
  model?: { contextWindow?: number };
  modelRegistry?: { getAll: () => Array<{ provider: string; id: string; contextWindow?: number }> };
};

export function resolveContextWindow(
  ctx: ContextWindowResolverContext,
  modelRef?: string,
): number | undefined {
  const fallback = ctx?.model?.contextWindow;
  if (!ctx?.modelRegistry || typeof ctx.modelRegistry.getAll !== "function") return fallback;
  const models = ctx.modelRegistry.getAll();
  if (!modelRef) return fallback;
  const normalized = normalizeModelRef(modelRef);
  if (normalized.provider) {
    const exact = models.find((m) => m.provider === normalized.provider && m.id === normalized.id);
    if (exact?.contextWindow) return exact.contextWindow;
  }
  const byId = models.find((m) => m.id === normalized.id);
  if (byId?.contextWindow) return byId.contextWindow;
  return fallback;
}

export function getUsedContextPercent(
  contextTokens?: number,
  contextWindow?: number,
): number | undefined {
  if (!contextWindow || contextWindow <= 0) return undefined;
  if (contextTokens === undefined || contextTokens === null || contextTokens < 0) return undefined;
  return Math.max(0, Math.min(100, Math.round((contextTokens / contextWindow) * 100)));
}

export function getRemainingContextPercent(usedPercent?: number): number | undefined {
  if (usedPercent === undefined || usedPercent === null) return undefined;
  return Math.max(0, Math.min(100, 100 - usedPercent));
}

export function formatContextUsageBar(percent: number, width = 10): string {
  const clamped = Math.max(0, Math.min(100, Math.round(percent)));
  const barWidth = Math.max(4, width);
  const filled = Math.round((clamped / 100) * barWidth);
  return `[${"#".repeat(filled)}${"-".repeat(barWidth - filled)}] ${clamped}%`;
}

export function getContextBarColorByRemaining(
  remainingPercent: number,
): "warning" | "error" | undefined {
  if (remainingPercent <= 15) return "error";
  if (remainingPercent <= 40) return "warning";
  return undefined;
}

// ━━━ Agent Color ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function agentBgIndex(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = ((h << 5) - h + name.charCodeAt(i)) | 0;
  return Math.abs(h) % AGENT_NAME_PALETTE.length;
}

// ━━━ Tool Call ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

type ThemeFg = (color: ThemeColor, text: string) => string;

function formatPathValueForPreview(value: unknown): string {
  const text =
    value === undefined || value === null
      ? "..."
      : typeof value === "string"
        ? value
        : JSON.stringify(value);
  const home = os.homedir();
  return text.startsWith(home) ? `~${text.slice(home.length)}` : text;
}

export function formatToolCall(
  toolName: string,
  args: Record<string, unknown>,
  themeFg: ThemeFg,
): string {
  const shortenPath = (v: unknown) => formatPathValueForPreview(v);
  switch (toolName) {
    case "bash": {
      const c = (args.command as string) || "...";
      const p = c.length > 60 ? `${c.slice(0, 60)}...` : c;
      return themeFg("muted", "$ ") + themeFg("toolOutput", p);
    }
    case "read": {
      const fp = shortenPath(args.file_path || args.path || "...");
      let t = themeFg("accent", fp);
      const o = args.offset as number | undefined;
      const l = args.limit as number | undefined;
      if (o !== undefined || l !== undefined) {
        const s = o ?? 1;
        const e = l !== undefined ? s + l - 1 : "";
        t += themeFg("warning", `:${s}${e ? `-${e}` : ""}`);
      }
      return themeFg("muted", "read ") + t;
    }
    case "write": {
      const fp = shortenPath(args.file_path || args.path || "...");
      const c = (args.content || "") as string;
      const lines = c.split("\n").length;
      let t = themeFg("muted", "write ") + themeFg("accent", fp);
      if (lines > 1) t += themeFg("dim", ` (${lines} lines)`);
      return t;
    }
    case "edit":
      return (
        themeFg("muted", "edit ") +
        themeFg("accent", shortenPath(args.file_path || args.path || "..."))
      );
    case "ls":
      return themeFg("muted", "ls ") + themeFg("accent", shortenPath(args.path || "."));
    default: {
      const s = JSON.stringify(args);
      const p = s.length > 50 ? `${s.slice(0, 50)}...` : s;
      return themeFg("accent", toolName) + themeFg("dim", ` ${p}`);
    }
  }
}

export function formatToolCallPlain(toolName: string, args: Record<string, unknown>): string {
  const shortenPath = (v: unknown) => formatPathValueForPreview(v);
  switch (toolName) {
    case "bash": {
      const c = (args.command as string) || "...";
      return `$ ${c.length > 60 ? `${c.slice(0, 60)}...` : c}`;
    }
    case "read": {
      const fp = shortenPath(args.file_path || args.path || "...");
      const o = args.offset as number | undefined;
      const l = args.limit as number | undefined;
      if (o !== undefined || l !== undefined) {
        const s = o ?? 1;
        const e = l !== undefined ? s + l - 1 : "";
        return `read ${fp}:${s}${e ? `-${e}` : ""}`;
      }
      return `read ${fp}`;
    }
    case "write": {
      const fp = shortenPath(args.file_path || args.path || "...");
      const c = (args.content || "") as string;
      const lines = c.split("\n").length;
      return lines > 1 ? `write ${fp} (${lines} lines)` : `write ${fp}`;
    }
    case "edit":
      return `edit ${shortenPath(args.file_path || args.path || "...")}`;
    case "ls":
      return `ls ${shortenPath(args.path || ".")}`;
    default: {
      const s = JSON.stringify(args);
      return `${toolName} ${s.length > 50 ? `${s.slice(0, 50)}...` : s}`;
    }
  }
}

// ━━━ Time ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function toSafeMs(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

export function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(toSafeMs(ms) / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}시간 ${minutes}분 ${seconds}초`;
  if (minutes > 0) return `${minutes}분 ${seconds}초`;
  return `${seconds}초`;
}

export function formatDurationBetween(start: Date | number, end: Date | number): string {
  const startMs = start instanceof Date ? start.getTime() : start;
  const endMs = end instanceof Date ? end.getTime() : end;
  return formatDuration(toSafeMs(endMs - startMs));
}

// ━━━ Run Summary ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function formatCommandRunSummary(run: {
  id: number;
  status: string;
  agent: string;
  contextMode?: string;
  turnCount?: number;
  elapsedMs: number;
  toolCalls: number;
}): string {
  const elapsedSec = Math.max(0, Math.round(run.elapsedMs / 1000));
  const contextLabel = run.contextMode === "main" ? "main" : "isolated";
  return `#${run.id} [${run.status}] ${run.agent} ctx:${contextLabel} turn:${run.turnCount ?? 1} ${elapsedSec}s tools:${run.toolCalls}`;
}
