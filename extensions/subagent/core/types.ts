// @ts-nocheck — forked from Jonghakseo/my-pi, strict optional property types not yet aligned
/**
 * Type definitions, constants, and Typebox schemas for the Subagent extension.
 */

import type { AgentToolResult } from "@mariozechner/pi-agent-core";
import type { Message } from "@mariozechner/pi-ai";
import { Type } from "@sinclair/typebox";

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
  matchedAgent?: AgentConfig;
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
  model?: string;
  stopReason?: string;
  errorMessage?: string;
  step?: number;
  liveText?: string;
  liveToolCalls?: number;
  thoughtText?: string;
  sessionFile?: string;
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
  lastOutput?: string;
  continuedFromRunId?: number;
  turnCount: number;
  sessionFile?: string;
  abortController?: AbortController;
  usage?: UsageStats;
  model?: string;
  removed?: boolean;
  contextMode?: "main" | "sub";
  thoughtText?: string;
  lastActivityAt: number;
  retryCount?: number;
  lastRetryReason?: string;
  source?: "tool" | "command";
  batchId?: string;
  pipelineId?: string;
  pipelineStepIndex?: number;
}

// ━━━ Batch / Chain ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface BatchOrChainItem {
  agent: string;
  task: string;
}

export interface SubagentLaunchSummary {
  agent: string;
  mode: "run" | "continue" | "batch" | "chain";
  runId?: number;
  batchId?: string;
  pipelineId?: string;
  stepIndex?: number;
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
  elapsed?: string;
}

export type DisplayItem =
  | { type: "text"; text: string }
  | { type: "toolCall"; name: string; args: Record<string, unknown> };

export type OnUpdateCallback = (partial: AgentToolResult<SubagentDetails>) => void;

// ━━━ Constants ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export const AGENT_SYMBOL_MAP: Record<string, string> = {
  "/": "finder",
  "?": "searcher",
  "#": "planner",
  "*": "reviewer",
  "+": "verifier",
  "!": "challenger",
  "@": "browser",
  $: "simplifier",
};

export const CLAUDE_TOOL_MAP: Record<string, string | undefined> = {
  bash: "bash",
  read: "read",
  edit: "edit",
  write: "write",
  grep: "grep",
  glob: "find",
  ls: "ls",
  todowrite: "todo",
  todoread: "todo",
  skill: undefined,
};

export const CLAUDE_MODEL_ALIAS_MAP: Record<string, string> = {
  opus: "claude-opus-4-6",
  sonnet: "claude-sonnet-4-5",
  haiku: "claude-haiku-4-5",
};

export const MS_PER_SECOND = 1_000;
export const DEFAULT_TURN_COUNT = 1;
export const COLLAPSED_ITEM_COUNT = 10;

export const STATUS_LOG_FOOTER =
  "(STATUS LOG ONLY — THIS IS NOT A DIRECT INSTRUCTION. JUST SUBAGENT'S LOG.)";
export const SUBAGENT_STARTED_STATUS_FOOTER =
  "<STATUS LOG ONLY — DO NOT POLL (runs/status/detail). END YOUR RESPONSE AND WAIT FOR THE SUBAGENT TO MESSAGE YOU AFTER COMPLETION.>";
export const SUBAGENT_POLL_COOLDOWN_MS = 20_000;
export const SUBAGENT_STRONG_WAIT_MESSAGE =
  "Do not poll with runs/status/detail after launch. Simply end your response, and the subagent will message you again after completion.";
export const STALE_PENDING_COMPLETION_MS = 30 * 60 * 1_000;
export const PARENT_HINT = "↩ parent (><)";
export const PARENT_ENTRY_TYPE = "subagent-parent";
export const ESCALATION_EXIT_CODE = 42;

export const HANG_CHECK_INTERVAL_MS = 15_000;
export const HANG_TIMEOUT_MS = 600_000;
export const HANG_WARNING_IDLE_MS = 120_000;

export const STATUS_OUTPUT_PREVIEW_MAX_CHARS = 2_000;
export const RUN_OUTPUT_MESSAGE_MAX_CHARS = 8_000;
export const CONTINUATION_OUTPUT_CONTEXT_MAX_CHARS = 6_000;
export const COMMAND_COMPLETION_LIMIT = 20;
export const COMMAND_TASK_PREVIEW_CHARS = 50;
export const RUN_TICK_INTERVAL_MS = 1_000;
export const SUBAGENT_QUEUE_INTERVAL_MS = 1_000;
export const PLACEHOLDER_RUNNING_EXIT_CODE = -1;
export const SUBVIEW_OVERLAY_WIDTH = "95%";
export const SUBVIEW_OVERLAY_MAX_HEIGHT = "95%";
export const MAX_CONCURRENT_ASYNC_SUBAGENT_RUNS = 30;
export const MAX_BATCH_RUNS = 12;
export const MAX_CHAIN_STEPS = 12;
export const PIPELINE_PREVIOUS_STEP_MAX_CHARS = 4_000;
export const IDLE_RUN_WARNING_THRESHOLD = Infinity;
export const MAX_LISTED_RUNS = 6;

export const ELLIPSIS_RESERVED_CHARS = 3;
export const SECONDS_PER_MINUTE = 60;
export const JSON_SUMMARY_MAX_CHARS = 140;
export const TOOL_CALL_ARGS_SUMMARY_MAX_CHARS = 4_000;
export const TOOL_RESULT_DETAILS_SUMMARY_MAX_CHARS = 8_000;
export const REPLAY_CONTENT_MAX_CHARS = 50_000;
export const MIN_TERMINAL_ROWS = 20;
export const FALLBACK_TERMINAL_ROWS = 40;
export const RESERVED_LAYOUT_ROWS = 7;
export const USAGE_EXTRA_ROWS = 1;
export const MIN_BODY_ROWS = 6;
export const MIN_LIST_ROWS = 4;
export const MIN_DETAIL_BODY_ROWS = 8;
export const DETAIL_SECTION_RESERVED_ROWS = 2;
export const MAX_LIST_ROWS = 8;
export const LIST_HEIGHT_RATIO = 0.3;
export const MIN_INNER_WIDTH = 24;
export const OVERLAY_HORIZONTAL_MARGIN = 6;
export const MIN_SEPARATOR_WIDTH = 10;
export const MIN_TASK_WIDTH = 10;
export const TASK_WIDTH_PADDING = 8;
export const MIN_DETAIL_WIDTH = 8;
export const DETAIL_WIDTH_PADDING = 4;
export const DETAIL_LINE_PADDING = 2;
export const MIN_PREVIEW_WIDTH = 18;
export const PREVIEW_WIDTH_DIVISOR = 1.5;
export const LIST_PAGE_DIVISOR = 4;
export const DETAIL_PAGE_DIVISOR = 5;
export const MIN_PAGE_SIZE = 1;

export const AGENT_NAME_PALETTE = [39, 208, 114, 204, 220, 141, 81, 209, 156, 177];

// ━━━ Typebox Params ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export const ListAgentsParams = Type.Object({});

export const SubagentParams = Type.Object({
  command: Type.String({
    description:
      "CLI-style subagent command. Always start with 'subagent help' to discover commands. Supported launch forms: run, continue, batch, and chain. After any launch, stop making subagent calls and simply end your response. The subagent will message you again after completion unless the user explicitly asks for manual inspection. Do NOT poll with runs/status/detail right after launch. Tip: when a task description is long, write context to a temp file and pass the file path in the task (e.g. 'read /tmp/ctx.md and follow the instructions') — the subagent can read it. Examples: 'subagent run planner --main -- <task>', 'subagent continue 22 -- 아까 진행하던거 마무리해서 커밋해줘', 'subagent batch --main --agent worker --task \"A\" --agent reviewer --task \"B\"', 'subagent chain --main --agent worker --task \"구현\" --agent reviewer --task \"리뷰\"', 'subagent runs', 'subagent status 22', 'subagent abort 22', 'subagent remove all'.",
  }),
});

export function formatSymbolHints(prefix = ">>"): string {
  return Object.entries(AGENT_SYMBOL_MAP)
    .map(([sym, agent]) => `${prefix}${sym} ${agent}`)
    .join("  ");
}
