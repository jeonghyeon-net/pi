/**
 * Type definitions and interfaces for the Subagent extension.
 */

import type { AgentToolResult } from "@mariozechner/pi-agent-core";
import type { Message } from "@mariozechner/pi-ai";
import type {
  CompactionEntry,
  CustomEntry,
  CustomMessageEntry,
  SessionEntry,
} from "@mariozechner/pi-coding-agent";

// ━━━ Agent ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export const AGENT_THINKING_LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh"] as const;
export type AgentThinkingLevel = (typeof AGENT_THINKING_LEVELS)[number];

export interface AgentConfig {
  name: string;
  description: string;
  tools?: string[];
  model?: string;
  thinking?: AgentThinkingLevel;
  systemPrompt: string;
  source: "user" | "project";
  filePath: string;
  character?: string;
}

export interface AgentDiscoveryResult {
  agents: AgentConfig[];
  projectAgentsDir: string | null;
}

export interface AgentAliasMatch {
  matchedAgent?: AgentConfig | undefined;
  ambiguousAgents: AgentConfig[];
}

// ━━━ Run / Result ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface UsageStats {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  cost: number;
  contextTokens: number;
  turns: number;
}

export interface SingleResult {
  agent: string;
  agentSource: "user" | "project" | "unknown";
  task: string;
  exitCode: number;
  messages: Message[];
  stderr: string;
  usage: UsageStats;
  model?: string | undefined;
  stopReason?: string | undefined;
  errorMessage?: string | undefined;
  step?: number | undefined;
  liveText?: string | undefined;
  liveToolCalls?: number | undefined;
  thoughtText?: string | undefined;
  sessionFile?: string | undefined;
}

export interface CommandRunState {
  id: number;
  agent: string;
  task: string;
  status: "running" | "done" | "error";
  startedAt: number;
  elapsedMs: number;
  toolCalls: number;
  lastLine: string;
  lastOutput?: string | undefined;
  continuedFromRunId?: number | undefined;
  turnCount: number;
  sessionFile?: string | undefined;
  abortController?: AbortController | undefined;
  usage?: UsageStats | undefined;
  model?: string | undefined;
  removed?: boolean | undefined;
  contextMode?: "main" | "isolated" | undefined;
  thoughtText?: string | undefined;
  lastActivityAt: number;
  retryCount?: number | undefined;
  lastRetryReason?: string | undefined;
  source?: "tool" | "command" | undefined;
  batchId?: string | undefined;
  pipelineId?: string | undefined;
  pipelineStepIndex?: number | undefined;
}

// ━━━ Batch / Chain ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface BatchOrChainItem {
  agent: string;
  task: string;
}

export interface SubagentLaunchSummary {
  agent: string;
  mode: "run" | "continue" | "batch" | "chain";
  runId?: number | undefined;
  batchId?: string | undefined;
  pipelineId?: string | undefined;
  stepIndex?: number | undefined;
}

export interface SubagentDetails {
  mode: "single" | "batch" | "chain";
  inheritMainContext: boolean;
  projectAgentsDir: string | null;
  results: SingleResult[];
  launches?: SubagentLaunchSummary[];
}

export interface BatchGroupState {
  batchId: string;
  runIds: number[];
  completedRunIds: Set<number>;
  failedRunIds: Set<number>;
  originSessionFile: string;
  createdAt: number;
  pendingResults: Map<number, string>;
  pendingCompletion?: PendingCompletion;
}

export interface PipelineStepResult {
  runId: number;
  agent: string;
  task: string;
  output: string;
  status: "done" | "error";
}

export interface PipelineState {
  pipelineId: string;
  currentIndex: number;
  stepRunIds: number[];
  stepResults: PipelineStepResult[];
  originSessionFile: string;
  createdAt: number;
  pendingCompletion?: PendingCompletion;
}

// ━━━ Session / Replay ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface PendingCompletion {
  message: {
    customType: string;
    content: string;
    display: boolean;
    details: Record<string, unknown>;
  };
  options: {
    deliverAs: "followUp";
    triggerTurn?: boolean;
  };
  createdAt: number;
}

export interface GlobalRunEntry {
  runState: CommandRunState;
  abortController: AbortController;
  originSessionFile: string;
  pendingCompletion?: PendingCompletion;
}

export interface SessionReplayItem {
  type: "user" | "assistant" | "tool";
  title: string;
  content: string;
  timestamp: Date;
  elapsed?: string | undefined;
}

export type DisplayItem =
  | { type: "text"; text: string }
  | { type: "toolCall"; name: string; args: Record<string, unknown> };

export type OnUpdateCallback = (partial: AgentToolResult<SubagentDetails>) => void;

// ━━━ Session Entry Type Guards ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function isCustomEntry(entry: SessionEntry): entry is CustomEntry {
  return entry.type === "custom";
}

export function isCustomMessageEntry(entry: SessionEntry): entry is CustomMessageEntry {
  return entry.type === "custom_message";
}

export function isCompactionEntry(entry: SessionEntry): entry is CompactionEntry {
  return entry.type === "compaction";
}
