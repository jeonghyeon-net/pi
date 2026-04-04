import type { ExtensionContext } from "@mariozechner/pi-coding-agent";
import {
  discoverAgents,
  getSubCommandAgentCompletions,
  matchSubCommandAgent,
} from "../../agent/discovery.js";
import {
  COMMAND_COMPLETION_LIMIT,
  COMMAND_TASK_PREVIEW_CHARS,
  CONTINUATION_OUTPUT_CONTEXT_MAX_CHARS,
  RUN_OUTPUT_MESSAGE_MAX_CHARS,
  RUN_TICK_INTERVAL_MS,
} from "../../core/constants.js";
import type { SubagentDeps } from "../../core/deps.js";
import { getFinalOutput, getLastNonEmptyLine, updateRunFromResult } from "../../core/store.js";
import type { CommandRunState, SingleResult, SubagentDetails } from "../../core/types.js";
import {
  finalizeAndCleanup,
  getCurrentSessionFile as getSessionFileFromCtx,
  isInOriginSession,
  makePendingCompletion,
  registerRunLaunch,
} from "../../execution/orchestrator.js";
import { invokeWithAutoRetry, MAX_SUBAGENT_AUTO_RETRIES } from "../../execution/retry.js";
import { enqueueSubagentInvocation } from "../../execution/run.js";
import { runSingleAgent } from "../../execution/runner.js";
import { buildMainContextText, wrapTaskWithMainContext } from "../../session/context.js";
import { captureSwitchSession } from "../../session/navigation.js";
import { formatUsageStats, truncateLines, truncateText } from "../../ui/format.js";
import { updateCommandRunsWidget } from "../../ui/widget.js";

export function buildSubCommand(deps: SubagentDeps) {
  const { pi, store } = deps;

  return {
    description:
      "Run a subagent in a dedicated sub-session: /sub:isolate <agent|alias> <task>, /sub:isolate <runId> <task>, /sub:isolate <task> (defaults to worker)",
    getArgumentCompletions: (argumentPrefix: string) => {
      const trimmedStart = argumentPrefix.trimStart();
      if (trimmedStart.includes(" ")) return null;

      const discovery = discoverAgents(process.cwd());
      const agentItems = getSubCommandAgentCompletions(discovery.agents, argumentPrefix) ?? [];

      const runItems = Array.from(store.commandRuns.values())
        .sort((a, b) => b.id - a.id)
        .filter((run) => !trimmedStart || run.id.toString().startsWith(trimmedStart))
        .slice(0, COMMAND_COMPLETION_LIMIT)
        .map((run) => ({
          value: `${run.id} `,
          label: `${run.id}`,
          description: `continue ${run.agent}: ${truncateText(run.task, COMMAND_TASK_PREVIEW_CHARS)}`,
        }));

      const merged = [...runItems, ...agentItems];
      return merged.length > 0 ? merged : null;
    },
    handler: async (args: string, ctx: ExtensionContext, forceMainContextFromWrapper = false) => {
      captureSwitchSession(store, ctx);
      const input = (args ?? "").trim();
      const usageText =
        "Usage: /sub:main <agent|alias> <task> | /sub:main <runId> <task> | /sub:main <task> | /sub:isolate <agent|alias> <task> | /sub:isolate <runId> <task> | /sub:isolate <task>";
      let forceMainContext = forceMainContextFromWrapper;

      if (input === "--main" || input.startsWith("--main ")) {
        ctx.ui.notify(
          "'--main' 접두어는 사용할 수 없습니다. /sub:main 또는 /sub:isolate 명령 자체로 컨텍스트를 선택하세요.",
          "warning",
        );
        return;
      }

      if (!input) {
        ctx.ui.notify(usageText, "info");
        return;
      }

      const discovery = discoverAgents(ctx.cwd);
      const agents = discovery.agents;

      if (agents.length === 0) {
        ctx.ui.notify(
          "No subagents found. Checked user (~/.pi/agent/agents) + project-local (.pi/agents, .claude/agents).",
          "error",
        );
        return;
      }

      const firstSpace = input.indexOf(" ");
      const firstToken = firstSpace === -1 ? input : input.slice(0, firstSpace);
      const continuationRun = /^\d+$/.test(firstToken)
        ? store.commandRuns.get(Number(firstToken))
        : undefined;

      let selectedAgent: string;
      let taskForDisplay: string;
      let taskForAgent: string;
      let continuedFromRunId: number | undefined;
      let sessionFileForRun: string | undefined;

      if (continuationRun) {
        if (firstSpace === -1) {
          ctx.ui.notify(usageText, "info");
          return;
        }

        const targetRunId = Number(firstToken);
        const targetRun = continuationRun;

        if (targetRun.status === "running") {
          ctx.ui.notify(`Subagent #${targetRunId} is already running.`, "warning");
          return;
        }

        const nextInstruction = input.slice(firstSpace + 1).trim();
        if (!nextInstruction) {
          ctx.ui.notify(usageText, "info");
          return;
        }

        const previousAgentName = targetRun.agent;
        const directAgent = agents.find(
          (agent) => agent.name.toLowerCase() === previousAgentName.toLowerCase(),
        );
        const fuzzyAgent = matchSubCommandAgent(agents, previousAgentName).matchedAgent;
        selectedAgent = directAgent?.name ?? fuzzyAgent?.name ?? previousAgentName;

        if (!agents.some((agent) => agent.name === selectedAgent)) {
          ctx.ui.notify(
            `Run #${targetRunId} references unknown agent "${previousAgentName}". Use /sub:main <agent> <task> instead.`,
            "error",
          );
          return;
        }

        taskForDisplay = `[continue #${targetRunId}] ${nextInstruction}`;
        continuedFromRunId = targetRunId;
        sessionFileForRun = targetRun.sessionFile;

        if (sessionFileForRun) {
          // True continuation: reuse the same per-run session file.
          taskForAgent = nextInstruction;
        } else {
          // Fallback for older runs that were started in isolated/no-session mode.
          const previousOutputRaw = (targetRun.lastOutput ?? targetRun.lastLine ?? "").trim();
          const previousOutput =
            previousOutputRaw.length > CONTINUATION_OUTPUT_CONTEXT_MAX_CHARS
              ? `${previousOutputRaw.slice(0, CONTINUATION_OUTPUT_CONTEXT_MAX_CHARS)}\n... [truncated]`
              : previousOutputRaw;

          taskForAgent = [
            `Continue subagent run #${targetRunId} using the same agent (${selectedAgent}).`,
            `Previous task:\n${targetRun.task}`,
            previousOutput
              ? `Previous output:\n${previousOutput}`
              : "Previous output: (not available)",
            `New instruction:\n${nextInstruction}`,
          ].join("\n\n");
        }
      } else {
        const { matchedAgent, ambiguousAgents } = matchSubCommandAgent(agents, firstToken);
        let resolvedAgent = matchedAgent;

        if (ambiguousAgents.length > 1) {
          const names = ambiguousAgents.map((agent) => agent.name).join(", ");

          if (firstSpace === -1) {
            ctx.ui.notify(
              `${usageText}. Ambiguous agent alias "${firstToken}": ${names}.`,
              "error",
            );
            return;
          }

          // NOTE(user-approved): no-UI 모드에서의 안내 처리 방식은 현재 구현을 유지한다.
          // (headless/RPC 경고 경로 개선은 이번 변경 범위에서 제외)
          if (!ctx.hasUI) {
            ctx.ui.notify(
              `Ambiguous agent alias "${firstToken}": ${names}. Use a longer alias or exact name.`,
              "error",
            );
            return;
          }

          const selectedName = await ctx.ui.select(
            `Ambiguous alias "${firstToken}" — choose subagent`,
            ambiguousAgents.map((agent) => agent.name),
          );
          if (!selectedName) {
            ctx.ui.notify("Subagent selection cancelled.", "info");
            return;
          }

          resolvedAgent = ambiguousAgents.find((agent) => agent.name === selectedName);
          if (!resolvedAgent) {
            ctx.ui.notify("Could not resolve selected subagent.", "error");
            return;
          }
        }

        if (resolvedAgent && firstSpace === -1) {
          ctx.ui.notify(usageText, "info");
          return;
        }

        selectedAgent = resolvedAgent?.name ?? "worker";
        taskForDisplay = resolvedAgent ? input.slice(firstSpace + 1).trim() : input;

        if (!taskForDisplay) {
          ctx.ui.notify(usageText, "info");
          return;
        }

        taskForAgent = taskForDisplay;
      }

      let existingRunState: CommandRunState | undefined;

      if (continuedFromRunId !== undefined) {
        existingRunState = store.commandRuns.get(continuedFromRunId);
        if (!existingRunState) {
          ctx.ui.notify(`Unknown subagent run #${continuedFromRunId}.`, "error");
          return;
        }
        // NOTE(user-approved): continuation 시 기존 context/session을 유지한다.
        // /sub:main 과 /sub:isolate 간 모드 전환은 기존 run에는 소급 적용하지 않는다.
        sessionFileForRun = existingRunState.sessionFile;
      } else if (forceMainContext) {
        // Extract main session context as text instead of copying the session file.
        // This prevents subagents from inheriting the main agent's persona.
        const subContextResult = buildMainContextText(ctx);
        const subContextText =
          typeof subContextResult === "string" ? subContextResult : subContextResult.text;
        const totalMessageCount =
          typeof subContextResult === "string" ? 0 : subContextResult.totalMessageCount;
        const rawMainSessionFile = ctx.sessionManager?.getSessionFile?.() ?? undefined;
        const mainSessionFile =
          typeof rawMainSessionFile === "string"
            ? rawMainSessionFile.replace(/[\r\n\t]+/g, "").trim() || undefined
            : undefined;
        if (subContextText || mainSessionFile) {
          taskForAgent = wrapTaskWithMainContext(taskForAgent, subContextText, {
            mainSessionFile,
            totalMessageCount,
          });
        } else {
          ctx.ui.notify(
            "Main session context is unavailable in this mode. Running with dedicated sub-session.",
            "warning",
          );
          forceMainContext = false;
        }
      }

      const originSessionFile = getSessionFileFromCtx(ctx);

      const runState = registerRunLaunch(store, ctx, {
        agent: selectedAgent,
        taskForDisplay,
        taskForAgent,
        inheritMainContext: forceMainContext,
        originSessionFile,
        continuedFromRunId,
        existingRunState,
        source: "command",
      });
      // Command-specific: reset retry tracking
      runState.retryCount = 0;
      runState.lastRetryReason = undefined;
      const runId = runState.id;
      const abortController = runState.abortController;
      if (!abortController) return;

      const makeDetails = (results: SingleResult[]): SubagentDetails => ({
        mode: "single",
        inheritMainContext: runState.contextMode === "main",
        projectAgentsDir: discovery.projectAgentsDir,
        results,
      });

      const contextLabel =
        runState.contextMode === "main" ? "main context" : "dedicated sub-session";
      const startedState = continuedFromRunId !== undefined ? "resumed" : "started";

      pi.sendMessage(
        {
          customType: "subagent-command",
          content:
            `[subagent:${selectedAgent}#${runId}] ${startedState}` +
            `\nContext: ${contextLabel} · turn ${runState.turnCount}`,
          display: false,
          details: {
            runId,
            agent: selectedAgent,
            task: taskForDisplay,
            continuedFromRunId,
            turnCount: runState.turnCount,
            contextMode: runState.contextMode,
            sessionFile: runState.sessionFile,
            status: startedState,
            startedAt: runState.startedAt,
            elapsedMs: runState.elapsedMs,
            lastActivityAt: runState.lastActivityAt,
            thoughtText: runState.thoughtText,
          },
        },
        { deliverAs: "followUp", triggerTurn: false },
      );

      ctx.ui.notify(
        `${
          continuedFromRunId !== undefined
            ? `Resumed subagent #${runId}: ${selectedAgent}`
            : `Started subagent #${runId}: ${selectedAgent}`
        } (${contextLabel} · turn ${runState.turnCount})`,
        "info",
      );

      const tick = setInterval(() => {
        const current = store.commandRuns.get(runId);
        if (!current || current.status !== "running") {
          clearInterval(tick);
          return;
        }
        current.elapsedMs = Date.now() - current.startedAt;
        updateCommandRunsWidget(store);
      }, RUN_TICK_INTERVAL_MS);

      (async () => {
        try {
          const { result, retryCount } = await invokeWithAutoRetry({
            maxRetries: MAX_SUBAGENT_AUTO_RETRIES,
            signal: abortController.signal,
            onRetryScheduled: ({ retryIndex, maxRetries, delayMs, reason }) => {
              runState.retryCount = retryIndex;
              runState.lastRetryReason = reason;
              runState.lastActivityAt = Date.now();
              runState.lastLine = `Auto-retrying ${retryIndex}/${maxRetries} in ${Math.ceil(delayMs / 1000)}s: ${reason}`;
              runState.lastOutput = runState.lastLine;
              updateCommandRunsWidget(store);
              ctx.ui.notify(
                `subagent #${runId} retry ${retryIndex}/${maxRetries}: ${reason}`,
                "warning",
              );
            },
            invoke: () =>
              enqueueSubagentInvocation(() =>
                runSingleAgent(
                  ctx.cwd,
                  agents,
                  selectedAgent,
                  taskForAgent,
                  undefined,
                  abortController.signal,
                  (partial) => {
                    if (runState.removed) return;
                    const current = partial.details?.results?.[0];
                    if (!current) return;
                    updateRunFromResult(runState, current);
                    updateCommandRunsWidget(store);
                  },
                  makeDetails,
                  runState.sessionFile,
                ),
              ),
          });
          runState.retryCount = retryCount;

          if (runState.removed) return;

          updateRunFromResult(runState, result);
          const isError =
            result.exitCode !== 0 ||
            result.stopReason === "error" ||
            result.stopReason === "aborted";
          runState.status = isError ? "error" : "done";
          runState.elapsedMs = Date.now() - runState.startedAt;
          updateCommandRunsWidget(store);

          const rawOutput = isError
            ? result.errorMessage ||
              result.stderr ||
              getFinalOutput(result.messages) ||
              "(no output)"
            : getFinalOutput(result.messages) || "(no output)";
          const output =
            isError && rawOutput.length > RUN_OUTPUT_MESSAGE_MAX_CHARS
              ? `${rawOutput.slice(0, RUN_OUTPUT_MESSAGE_MAX_CHARS)}\n\n... [truncated]`
              : rawOutput;
          const usage = formatUsageStats(result.usage, result.model);

          runState.lastOutput = rawOutput;
          if (rawOutput) runState.lastLine = getLastNonEmptyLine(rawOutput);

          const completionMessage = {
            customType: "subagent-command" as const,
            content:
              `[subagent:${selectedAgent}#${runId}] ${isError ? "failed" : "completed"}` +
              `\nPrompt: ${truncateLines(taskForDisplay, 2)}` +
              (usage ? `\nUsage: ${usage}` : "") +
              (runState.retryCount
                ? `\nRetries: ${runState.retryCount}/${MAX_SUBAGENT_AUTO_RETRIES}`
                : "") +
              (runState.thoughtText ? `\nThought: ${runState.thoughtText}` : "") +
              `\n\n${output}`,
            display: true,
            details: {
              runId,
              agent: selectedAgent,
              task: taskForDisplay,
              continuedFromRunId,
              turnCount: runState.turnCount,
              contextMode: runState.contextMode,
              sessionFile: runState.sessionFile,
              startedAt: runState.startedAt,
              elapsedMs: runState.elapsedMs,
              lastActivityAt: runState.lastActivityAt,
              exitCode: result.exitCode,
              usage: result.usage,
              model: result.model,
              source: result.agentSource,
              thoughtText: runState.thoughtText,
              retryCount: runState.retryCount,
              status: runState.status,
            },
          };
          // Intentionally keep triggerTurn off for subagent status logs.
          // These are telemetry follow-ups, not user-facing turn triggers.
          if (isInOriginSession(ctx, originSessionFile)) {
            pi.sendMessage(completionMessage, { deliverAs: "followUp" });
            store.globalLiveRuns.delete(runId);
          } else {
            const globalEntry = store.globalLiveRuns.get(runId);
            if (globalEntry) {
              globalEntry.pendingCompletion = makePendingCompletion(completionMessage, false);
            }
            // Re-insert into commandRuns so the widget shows completion.
            store.commandRuns.set(runId, runState);
          }

          ctx.ui.notify(
            isError
              ? `subagent #${runId} (${selectedAgent}) failed`
              : `subagent #${runId} (${selectedAgent}) completed`,
            isError ? "error" : "info",
          );
        } catch (error: unknown) {
          if (runState.removed) return;
          runState.status = "error";
          runState.elapsedMs = Date.now() - runState.startedAt;
          runState.lastLine = error instanceof Error ? error.message : "Subagent execution failed";
          runState.lastOutput = runState.lastLine;

          const cmdErrorMessage = {
            customType: "subagent-command" as const,
            content:
              `[subagent:${selectedAgent}#${runId}] failed` +
              `\nPrompt: ${truncateLines(taskForDisplay, 2)}` +
              `\n\n${runState.lastLine}`,
            display: true,
            details: {
              runId,
              agent: selectedAgent,
              task: taskForDisplay,
              continuedFromRunId,
              turnCount: runState.turnCount,
              contextMode: runState.contextMode,
              sessionFile: runState.sessionFile,
              startedAt: runState.startedAt,
              elapsedMs: runState.elapsedMs,
              lastActivityAt: runState.lastActivityAt,
              error: runState.lastLine,
              thoughtText: runState.thoughtText,
              status: runState.status,
            },
          };

          // Keep triggerTurn disabled for error telemetry as well.
          if (isInOriginSession(ctx, originSessionFile)) {
            pi.sendMessage(cmdErrorMessage, { deliverAs: "followUp" });
            store.globalLiveRuns.delete(runId);
          } else {
            const cmdErrGlobalEntry = store.globalLiveRuns.get(runId);
            if (cmdErrGlobalEntry) {
              cmdErrGlobalEntry.pendingCompletion = makePendingCompletion(cmdErrorMessage, false);
            }
            store.commandRuns.set(runId, runState);
          }

          ctx.ui.notify(`subagent #${runId} failed: ${runState.lastLine}`, "error");
        } finally {
          clearInterval(tick);
          finalizeAndCleanup(store, runState, { ctx, pi });
        }
      })().catch(() => {
        /* fire-and-forget: errors handled internally */
      });
    },
  };
}
