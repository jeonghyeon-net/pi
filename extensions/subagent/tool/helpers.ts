/**
 * Pure helper functions and message builders for the subagent tool.
 */

import * as fs from "node:fs";
import {
  ESCALATION_EXIT_CODE,
  IDLE_RUN_WARNING_THRESHOLD,
  SUBAGENT_STRONG_WAIT_MESSAGE,
} from "../core/constants.js";
import { getFinalOutput, getLastNonEmptyLine, updateRunFromResult } from "../core/store.js";
import type {
  CommandRunState,
  PipelineStepResult,
  SingleResult,
  SubagentDetails,
  SubagentLaunchSummary,
} from "../core/types.js";
import { readAndConsumeEscalation } from "../session/persist.js";
import {
  formatCommandRunSummary,
  formatUsageStats,
  stringifyToolCallArguments,
  truncateLines,
} from "../ui/format.js";
import type {
  AssistantContentPart,
  AssistantMessageEntry,
  FinalizedRun,
  LaunchMode,
  ResultFailureDiagnosis,
  SessionDetailSummary,
  SessionToolCall,
  SessionTurnToolCalls,
} from "./types.js";

export function getAssistantTextPart(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  for (const part of content as AssistantContentPart[]) {
    if (part?.type === "text" && typeof part.text === "string") {
      return part.text;
    }
  }
  return "";
}

export function parseSessionDetailSummary(sessionFile?: string): SessionDetailSummary {
  if (!sessionFile) {
    return { finalOutput: "", turns: [], error: "Session file is not available for this run." };
  }
  if (!fs.existsSync(sessionFile)) {
    return {
      finalOutput: "",
      turns: [],
      error:
        `Session file not found: ${sessionFile}. ` +
        "The subagent likely exited before producing any persisted message (turn=0 / no output).",
    };
  }

  let raw = "";
  try {
    raw = fs.readFileSync(sessionFile, "utf-8");
  } catch (error) {
    return {
      finalOutput: "",
      turns: [],
      error: `Failed to read session file: ${(error as Error).message}`,
    };
  }

  const assistantMessages: Array<{ content?: unknown }> = [];
  const turns: SessionTurnToolCalls[] = [];

  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim()) continue;

    let entry: AssistantMessageEntry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }

    if (entry?.type !== "message" || !entry.message || entry.message.role !== "assistant") continue;

    assistantMessages.push(entry.message);
    const turn = assistantMessages.length;
    const toolCalls: SessionToolCall[] = [];
    const content = entry.message.content;

    if (Array.isArray(content)) {
      for (const part of content as AssistantContentPart[]) {
        if (part?.type !== "toolCall") continue;
        const name = typeof part.name === "string" ? part.name : "tool";
        const argsText = stringifyToolCallArguments(part.arguments);
        toolCalls.push({ name, argsText });
      }
    }

    if (toolCalls.length > 0) {
      turns.push({ turn, toolCalls });
    }
  }

  let finalOutput = "";
  for (let i = assistantMessages.length - 1; i >= 0; i--) {
    const text = getAssistantTextPart(assistantMessages[i]?.content);
    if (text) {
      finalOutput = text;
      break;
    }
  }

  return { finalOutput, turns };
}

export function diagnoseResultFailure(result: SingleResult): ResultFailureDiagnosis {
  if (result.exitCode !== 0)
    return { failed: true, reason: `Subagent process exited with code ${result.exitCode}.` };
  if (result.stopReason === "error")
    return { failed: true, reason: result.errorMessage || "Subagent reported stopReason=error." };
  if (result.stopReason === "aborted")
    return { failed: true, reason: "Subagent execution was aborted." };

  const finalOutput = getFinalOutput(result.messages).trim();
  const hasAssistantText = finalOutput.length > 0;
  if (hasAssistantText) return { failed: false };

  const stderr = (result.stderr || "").trim();
  if (result.messages.length === 0) {
    return {
      failed: true,
      reason:
        "Subagent returned no messages (turn=0). " +
        (stderr
          ? `stderr: ${stderr}`
          : "No stderr captured. Child process may have exited before producing output."),
    };
  }

  return {
    failed: true,
    reason: `Subagent finished without assistant text output. ${stderr ? `stderr: ${stderr}` : "No stderr captured."}`,
  };
}

export function formatRunDetailOutput(run: CommandRunState): string {
  const sessionSummary = parseSessionDetailSummary(run.sessionFile);
  const runOutput = run.lastOutput?.trim() ? run.lastOutput : "";
  const sessionOutput = sessionSummary.finalOutput?.trim() ? sessionSummary.finalOutput : "";
  const lineOutput = run.lastLine?.trim() ? run.lastLine : "";
  const output = runOutput || sessionOutput || lineOutput || "(no output)";
  const lines: string[] = [formatCommandRunSummary(run), `Prompt: ${run.task}`];

  if (run.sessionFile) lines.push(`Session: ${run.sessionFile}`);
  if (run.thoughtText) lines.push(`Thought: ${run.thoughtText}`);

  lines.push("", "Result:", output, "", "Tool calls by turn:");

  if (sessionSummary.error) {
    lines.push(`- (session parse error) ${sessionSummary.error}`);
  }

  if (sessionSummary.turns.length === 0) {
    lines.push("- (no tool calls)");
  } else {
    for (const turn of sessionSummary.turns) {
      lines.push(`Turn ${turn.turn}:`);
      for (const toolCall of turn.toolCalls) {
        lines.push(`  - ${toolCall.name}${toolCall.argsText ? ` ${toolCall.argsText}` : ""}`);
      }
    }
  }

  return lines.join("\n");
}

export function getRunCounts(store: {
  commandRuns: Map<number, CommandRunState>;
  globalLiveRuns: Map<number, { runState: CommandRunState }>;
}): { running: number; idle: number } {
  const dedupedRunning = new Map<number, CommandRunState>();

  for (const [runId, run] of store.commandRuns) {
    if (run.removed) continue;
    dedupedRunning.set(runId, run);
  }

  for (const [runId, entry] of store.globalLiveRuns) {
    if (entry.runState.removed) continue;
    dedupedRunning.set(runId, entry.runState);
  }

  const running = Array.from(dedupedRunning.values()).filter(
    (run) => run.status === "running",
  ).length;
  const idle = Array.from(store.commandRuns.values()).filter(
    (run) => !run.removed && run.status !== "running",
  ).length;
  return { running, idle };
}

export function formatIdleRunWarning(idleRunCount: number): string {
  return (
    `⚠️ Idle subagent runs: ${idleRunCount}. ` +
    `removed되지 않은 완료/오류 run이 ${IDLE_RUN_WARNING_THRESHOLD}개 이상입니다. ` +
    "필요 없는 run은 `subagent remove <runId|all>`로 정리하세요."
  );
}

export function createEmptyDetails(
  mode: LaunchMode,
  inheritMainContext: boolean,
  projectAgentsDir: string | null,
  launches: SubagentLaunchSummary[] = [],
): SubagentDetails {
  return {
    mode,
    inheritMainContext,
    projectAgentsDir,
    results: [],
    launches,
  };
}

export function buildRunStartMessage(runState: CommandRunState, status: "started" | "resumed") {
  const contextLabel = runState.contextMode === "main" ? "main context" : "dedicated sub-session";
  return {
    customType: "subagent-tool" as const,
    content:
      `[subagent:${runState.agent}#${runState.id}] ${status}` +
      `\nContext: ${contextLabel} · turn ${runState.turnCount}`,
    display: false,
    details: {
      runId: runState.id,
      agent: runState.agent,
      task: runState.task,
      continuedFromRunId: runState.continuedFromRunId,
      turnCount: runState.turnCount,
      contextMode: runState.contextMode,
      sessionFile: runState.sessionFile,
      status,
      startedAt: runState.startedAt,
      elapsedMs: runState.elapsedMs,
      lastActivityAt: runState.lastActivityAt,
      thoughtText: runState.thoughtText,
      batchId: runState.batchId,
      pipelineId: runState.pipelineId,
      pipelineStepIndex: runState.pipelineStepIndex,
    },
  };
}

export function buildRunCompletionMessage(
  finalized: FinalizedRun,
  options?: { display?: boolean },
) {
  const { runState, result, isError, rawOutput } = finalized;
  const usage = result ? formatUsageStats(result.usage, result.model) : "";
  return {
    customType: "subagent-tool" as const,
    content:
      `[subagent:${runState.agent}#${runState.id}] ${isError ? "failed" : "completed"}` +
      `\nPrompt: ${truncateLines(runState.task, 2)}` +
      (usage ? `\nUsage: ${usage}` : "") +
      (runState.thoughtText ? `\nThought: ${runState.thoughtText}` : "") +
      `\n\n${rawOutput}`,
    display: options?.display ?? true,
    details: {
      runId: runState.id,
      agent: runState.agent,
      task: runState.task,
      continuedFromRunId: runState.continuedFromRunId,
      turnCount: runState.turnCount,
      contextMode: runState.contextMode,
      sessionFile: runState.sessionFile,
      startedAt: runState.startedAt,
      elapsedMs: runState.elapsedMs,
      lastActivityAt: runState.lastActivityAt,
      exitCode: result?.exitCode,
      usage: result?.usage,
      model: result?.model,
      source: result?.agentSource,
      thoughtText: runState.thoughtText,
      status: runState.status,
      batchId: runState.batchId,
      pipelineId: runState.pipelineId,
      pipelineStepIndex: runState.pipelineStepIndex,
    },
  };
}

export function buildEscalationMessage(
  runState: CommandRunState,
  escalationMessage: string,
  result: SingleResult,
) {
  const usage = formatUsageStats(result.usage, result.model);
  return {
    customType: "subagent-tool" as const,
    content:
      `[subagent:${runState.agent}#${runState.id}] escalated` +
      `\nPrompt: ${truncateLines(runState.task, 2)}` +
      (usage ? `\nUsage: ${usage}` : "") +
      `\n\n[ESCALATION] ${escalationMessage}`,
    display: true,
    details: {
      runId: runState.id,
      agent: runState.agent,
      task: runState.task,
      status: "error" as const,
      startedAt: runState.startedAt,
      elapsedMs: runState.elapsedMs,
      lastActivityAt: runState.lastActivityAt,
      exitCode: result.exitCode,
      usage: result.usage,
      model: result.model,
      batchId: runState.batchId,
      pipelineId: runState.pipelineId,
      pipelineStepIndex: runState.pipelineStepIndex,
    },
  };
}

export function buildStrongWaitMessage(runId: number): string {
  return `Run #${runId} is still running.\n${SUBAGENT_STRONG_WAIT_MESSAGE}`;
}

export function finalizeRunState(runState: CommandRunState, result: SingleResult): FinalizedRun {
  updateRunFromResult(runState, result);

  if (result.exitCode === ESCALATION_EXIT_CODE && runState.sessionFile) {
    const escalation = readAndConsumeEscalation(runState.sessionFile);
    const escalationMsg = escalation?.message ?? "Subagent escalated without a message.";
    runState.status = "error";
    runState.elapsedMs = Date.now() - runState.startedAt;
    runState.lastOutput = `[ESCALATION] ${escalationMsg}`;
    runState.lastLine = `[ESCALATION] ${escalationMsg}`;
    return {
      runState,
      result,
      isError: true,
      rawOutput: `[ESCALATION] ${escalationMsg}`,
    };
  }

  const failure = diagnoseResultFailure(result);
  const isError = failure.failed;
  runState.status = isError ? "error" : "done";
  runState.elapsedMs = Date.now() - runState.startedAt;
  const rawOutput = isError
    ? buildErrorOutput(failure.reason, result)
    : getFinalOutput(result.messages);
  runState.lastOutput = rawOutput;
  runState.lastLine = getLastNonEmptyLine(rawOutput);

  return { runState, result, isError, rawOutput };
}

export function buildErrorOutput(
  failureReason: string | undefined,
  result: Pick<SingleResult, "errorMessage" | "stderr" | "messages">,
): string {
  return (
    failureReason ||
    result.errorMessage ||
    result.stderr ||
    getFinalOutput(result.messages) ||
    "(no output)"
  );
}

export function formatBatchSummary(
  batchId: string,
  runs: CommandRunState[],
  terminalStatus: "completed" | "error",
): string {
  const headerStatus = runs
    .map((run) => `#${run.id} ${run.status === "done" ? "done" : "error"}`)
    .join(", ");
  const body = runs
    .map((run) => {
      const summary = run.lastOutput?.trim() || run.lastLine?.trim() || "(no output)";
      return `#${run.id} ${run.agent}\n- ${summary}`;
    })
    .join("\n\n");
  return `[subagent-batch#${batchId}] ${terminalStatus}\nRuns: ${headerStatus}\n\n${body}`;
}

export function formatPipelineSummary(
  pipelineId: string,
  stepResults: PipelineStepResult[],
  terminalStatus: "completed" | "stopped" | "error",
): string {
  const steps = stepResults
    .map(
      (step, index) =>
        `Step ${index + 1} · #${step.runId} ${step.agent} · ${step.status}\nTask: ${step.task}\n${step.output}`,
    )
    .join("\n\n");
  return `[subagent-chain#${pipelineId}] ${terminalStatus}\n\n${steps}`;
}

export function toLaunchSummary(
  runState: Pick<CommandRunState, "agent" | "id" | "batchId" | "pipelineId" | "pipelineStepIndex">,
  mode: SubagentLaunchSummary["mode"],
): SubagentLaunchSummary {
  return {
    agent: runState.agent,
    mode,
    runId: runState.id,
    batchId: runState.batchId,
    pipelineId: runState.pipelineId,
    stepIndex: runState.pipelineStepIndex,
  };
}

export function buildRunAnalyticsSummary(
  runState: Pick<
    CommandRunState,
    | "id"
    | "agent"
    | "status"
    | "elapsedMs"
    | "model"
    | "batchId"
    | "pipelineId"
    | "pipelineStepIndex"
  >,
): Record<string, unknown> {
  return {
    runId: runState.id,
    agent: runState.agent,
    status: runState.status,
    elapsedMs: runState.elapsedMs,
    model: runState.model,
    batchId: runState.batchId,
    pipelineId: runState.pipelineId,
    stepIndex: runState.pipelineStepIndex,
  };
}
