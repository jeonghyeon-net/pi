/**
 * Subagent process execution and result processing.
 */

import { spawn } from "node:child_process";
import * as fs from "node:fs";
import type { AssistantMessage, Message } from "@mariozechner/pi-ai";
import { getFinalOutput } from "../core/store.js";
import type {
  AgentConfig,
  OnUpdateCallback,
  SingleResult,
  SubagentDetails,
} from "../core/types.js";
import { writePromptToTempFile } from "../session/context.js";

const AGENT_END_FALLBACK_MS = 1_500;
const SIGKILL_GRACE_MS = 5_000;

function appendStderrDiagnostic(result: SingleResult, message: string): void {
  const line = `[runner] ${message}`;
  result.stderr = result.stderr ? `${result.stderr.trimEnd()}\n${line}\n` : `${line}\n`;
}

/**
 * Prevent tasks starting with `/` from being treated as slash commands
 * inside the spawned pi process.
 *
 * We prepend one space (requested behavior) and escape the slash, so
 * trim()-based slash command interceptors won't swallow the task.
 */
function normalizeTaskForSubagentPrompt(task: string): string {
  if (task.startsWith("/")) return ` \\${task}`;
  return task;
}

// ─── Single Agent Execution ──────────────────────────────────────────────────

export async function runSingleAgent(
  defaultCwd: string,
  agents: AgentConfig[],
  agentName: string,
  task: string,
  step: number | undefined,
  signal: AbortSignal | undefined,
  onUpdate: OnUpdateCallback | undefined,
  makeDetails: (results: SingleResult[]) => SubagentDetails,
  sessionFile?: string,
): Promise<SingleResult> {
  const agent = agents.find((a) => a.name === agentName);

  if (!agent) {
    const available = agents.map((a) => `"${a.name}"`).join(", ") || "none";
    return {
      agent: agentName,
      agentSource: "unknown",
      task,
      exitCode: 1,
      messages: [],
      stderr: `Unknown agent: "${agentName}". Available agents: ${available}.`,
      usage: {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        cost: 0,
        contextTokens: 0,
        turns: 0,
      },
      step,
    };
  }

  const args: string[] = ["--mode", "json", "-p"];
  if (sessionFile) args.push("--session", sessionFile);
  else args.push("--no-session");
  if (agent.model) args.push("--model", agent.model);
  if (agent.thinking) args.push("--thinking", agent.thinking);
  if (agent.tools && agent.tools.length > 0) args.push("--tools", agent.tools.join(","));

  let tmpPromptDir: string | null = null;
  let tmpPromptPath: string | null = null;

  const currentResult: SingleResult = {
    agent: agentName,
    agentSource: agent.source,
    task,
    exitCode: 0,
    messages: [],
    stderr: "",
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      cost: 0,
      contextTokens: 0,
      turns: 0,
    },
    model: agent.model,
    step,
    sessionFile,
  };

  const emitUpdate = () => {
    if (onUpdate) {
      onUpdate({
        content: [
          {
            type: "text",
            text:
              getFinalOutput(currentResult.messages) || currentResult.liveText || "(running...)",
          },
        ],
        details: makeDetails([currentResult]),
      });
    }
  };

  try {
    if (agent.systemPrompt.trim()) {
      const tmp = writePromptToTempFile(agent.name, agent.systemPrompt);
      tmpPromptDir = tmp.dir;
      tmpPromptPath = tmp.filePath;
      args.push("--append-system-prompt", tmpPromptPath);
    }

    args.push(normalizeTaskForSubagentPrompt(task));
    let wasAborted = false;

    const exitCode = await new Promise<number>((resolve) => {
      const proc = spawn("pi", args, {
        cwd: defaultCwd,
        shell: false,
        stdio: ["ignore", "pipe", "pipe"],
      });
      let buffer = "";
      let procExited = false;
      let settled = false;
      let exitFallbackTimer: ReturnType<typeof setTimeout> | undefined;
      let agentEndFallbackTimer: ReturnType<typeof setTimeout> | undefined;
      let lastExitCode = 0;
      let lastEventAt = Date.now();
      let sawAgentEnd = false;
      let settleReason = "unknown";
      let unparsedStdoutCount = 0;
      const unparsedStdoutTail: string[] = [];

      type PiJsonEvent = {
        type: string;
        messages?: Message[];
        message?: Message;
        assistantMessageEvent?: { type: string; delta?: string };
      };

      const processLine = (line: string) => {
        if (!line.trim()) return;
        let event: PiJsonEvent;
        try {
          event = JSON.parse(line) as PiJsonEvent;
        } catch {
          unparsedStdoutCount++;
          const snippet = line.trim().slice(0, 300);
          if (snippet) {
            unparsedStdoutTail.push(snippet);
            if (unparsedStdoutTail.length > 3) unparsedStdoutTail.shift();
          }
          return;
        }
        lastEventAt = Date.now();

        if (event.type === "agent_start" || event.type === "turn_start") {
          sawAgentEnd = false;
          return;
        }

        if (event.type === "agent_end") {
          // Bug fix: agent.js catch block emits agent_end without message_end on
          // rate-limit / abort / network errors, so stopReason is never set via
          // the message_end path. Recover it from event.messages directly.
          // CRITICAL: Must also add these messages to currentResult.messages,
          // otherwise getFinalOutput() returns "" and the task fails with "Output was empty".
          for (const msg of (event.messages ?? []) as Message[]) {
            // Reference-equality check first; content-based fallback for deserialized messages
            const isDuplicate = currentResult.messages.some(
              (m) =>
                m === msg ||
                (m.role === msg.role && JSON.stringify(m.content) === JSON.stringify(msg.content)),
            );
            if (!isDuplicate) {
              currentResult.messages.push(msg);
            }
            if (msg.role === "assistant") {
              const assistantMsg = msg as AssistantMessage;
              if (assistantMsg.stopReason && !currentResult.stopReason) {
                currentResult.stopReason = assistantMsg.stopReason;
                if (assistantMsg.errorMessage)
                  currentResult.errorMessage = assistantMsg.errorMessage;
              }
            }
          }
          sawAgentEnd = true;
          scheduleAgentEndForceResolve();
          return;
        }

        if (event.type === "message_update") {
          const delta = event.assistantMessageEvent;
          if (delta?.type === "text_delta") {
            const chunk = typeof delta.delta === "string" ? delta.delta : "";
            if (chunk) {
              currentResult.liveText = `${currentResult.liveText ?? ""}${chunk}`;
              emitUpdate();
            }
          }
          return;
        }

        if (event.type === "tool_execution_start") {
          currentResult.liveToolCalls = (currentResult.liveToolCalls ?? 0) + 1;
          emitUpdate();
          return;
        }

        if (event.type === "message_end" && event.message) {
          const msg = event.message as Message;
          currentResult.messages.push(msg);

          if (msg.role === "assistant") {
            currentResult.liveText = undefined;
            currentResult.usage.turns++;
            const usage = msg.usage;
            if (usage) {
              currentResult.usage.input += usage.input || 0;
              currentResult.usage.output += usage.output || 0;
              currentResult.usage.cacheRead += usage.cacheRead || 0;
              currentResult.usage.cacheWrite += usage.cacheWrite || 0;
              currentResult.usage.cost += usage.cost?.total || 0;
              currentResult.usage.contextTokens = usage.totalTokens || 0;
            }
            if (!currentResult.model && msg.model) currentResult.model = msg.model;
            if (msg.stopReason) currentResult.stopReason = msg.stopReason;
            if (msg.errorMessage) currentResult.errorMessage = msg.errorMessage;

            // Extract thoughtText from thinking block first line only
            for (const part of msg.content) {
              if (part.type === "thinking") {
                const raw = "thinking" in part ? (part.thinking ?? "") : "";
                const firstLine = raw
                  .split("\n")
                  .map((l: string) => l.trim())
                  .filter(Boolean)[0];
                if (firstLine) {
                  // Strip markdown: **bold**, *italic*, `code`, # headers
                  const clean = firstLine
                    .replace(/^#+\s*/, "")
                    .replace(/\*{1,3}([^*]+)\*{1,3}/g, "$1")
                    .replace(/`([^`]+)`/g, "$1")
                    .trim();
                  if (clean) currentResult.thoughtText = clean.slice(0, 80);
                }
              }
            }
          }
          emitUpdate();
          if (sawAgentEnd) scheduleAgentEndForceResolve();
          return;
        }

        if (event.type === "tool_result_end" && event.message) {
          currentResult.messages.push(event.message as Message);
          emitUpdate();
          if (sawAgentEnd) scheduleAgentEndForceResolve();
          return;
        }

        if (sawAgentEnd) scheduleAgentEndForceResolve();
      };

      const resolveOnce = (code: number) => {
        if (settled) return;
        settled = true;
        if (exitFallbackTimer) {
          clearTimeout(exitFallbackTimer);
          exitFallbackTimer = undefined;
        }
        if (agentEndFallbackTimer) {
          clearTimeout(agentEndFallbackTimer);
          agentEndFallbackTimer = undefined;
        }
        if (buffer.trim()) processLine(buffer);

        if (currentResult.messages.length === 0) {
          appendStderrDiagnostic(
            currentResult,
            `no assistant/tool messages captured; settleReason=${settleReason}; exitCode=${code}; sawAgentEnd=${sawAgentEnd}`,
          );
          if (unparsedStdoutCount > 0) {
            appendStderrDiagnostic(
              currentResult,
              `unparsed stdout lines=${unparsedStdoutCount}; tail=${unparsedStdoutTail.join(" | ") || "(empty)"}`,
            );
          }
        }
        resolve(code);
      };

      // print-mode sometimes keeps the Node process alive after agent_end
      // (e.g. lingering extension timers/transports). In that case, force
      // resolve after a short quiet period so runs do not remain "running" forever.
      function scheduleAgentEndForceResolve() {
        if (!sawAgentEnd || settled || procExited) return;
        if (agentEndFallbackTimer) clearTimeout(agentEndFallbackTimer);

        const marker = lastEventAt;
        agentEndFallbackTimer = setTimeout(() => {
          if (settled || procExited || wasAborted) return;
          if (lastEventAt !== marker) return;

          const forcedCode =
            currentResult.stopReason === "error" || currentResult.stopReason === "aborted" ? 1 : 0;

          proc.kill("SIGTERM");
          setTimeout(() => {
            if (!procExited && proc.exitCode === null) proc.kill("SIGKILL");
          }, SIGKILL_GRACE_MS);

          settleReason = "agent_end_fallback_timeout";
          resolveOnce(forcedCode);
        }, AGENT_END_FALLBACK_MS);
      }

      proc.stdout.on("data", (data) => {
        buffer += data.toString();
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) processLine(line);
      });

      proc.stderr.on("data", (data) => {
        currentResult.stderr += data.toString();
      });

      proc.on("exit", (code) => {
        procExited = true;
        lastExitCode = code ?? 0;
        // In rare cases stdout/stderr pipes may stay open after process exit.
        // Use a short fallback so runs cannot stay "running" forever.
        exitFallbackTimer = setTimeout(() => {
          settleReason = "exit_fallback_timeout";
          resolveOnce(lastExitCode);
        }, AGENT_END_FALLBACK_MS);
      });

      proc.on("close", (code) => {
        procExited = true;
        settleReason = "close";
        resolveOnce(code ?? lastExitCode ?? 0);
      });

      proc.on("error", (error) => {
        procExited = true;
        appendStderrDiagnostic(currentResult, `process error: ${error?.message || String(error)}`);
        settleReason = "process_error";
        resolveOnce(1);
      });

      if (signal) {
        const killProc = () => {
          wasAborted = true;
          settleReason = "aborted_by_signal";
          proc.kill("SIGTERM");
          setTimeout(() => {
            if (!procExited && proc.exitCode === null) proc.kill("SIGKILL");
          }, SIGKILL_GRACE_MS);
        };
        if (signal.aborted) killProc();
        else signal.addEventListener("abort", killProc, { once: true });
      }
    });

    currentResult.exitCode = exitCode;
    if (wasAborted) throw new Error("Subagent was aborted");
    return currentResult;
  } finally {
    if (tmpPromptPath)
      try {
        fs.unlinkSync(tmpPromptPath);
      } catch {
        /* ignore */
      }
    if (tmpPromptDir)
      try {
        fs.rmdirSync(tmpPromptDir);
      } catch {
        /* ignore */
      }
  }
}
