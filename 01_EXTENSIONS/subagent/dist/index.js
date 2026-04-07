// src/tool.ts
import { defineTool } from "@mariozechner/pi-coding-agent";
import { readdirSync, readFileSync, existsSync as existsSync2 } from "fs";

// src/cli.ts
function parseArgs(input) {
  const result2 = { _: [] };
  const tokens = input.match(/(?:[^\s"]+|"[^"]*")+/g) ?? [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.startsWith("--")) {
      const key = t.slice(2);
      const next = tokens[i + 1];
      if (!next || next.startsWith("--")) {
        result2[key] = true;
        continue;
      }
      i++;
      const val = next.replace(/^"|"$/g, "");
      const prev = result2[key];
      if (Array.isArray(prev)) {
        prev.push(val);
      } else if (prev !== void 0 && prev !== true) {
        result2[key] = [prev, val];
      } else {
        result2[key] = val;
      }
    } else {
      result2._.push(t.replace(/^"|"$/g, ""));
    }
  }
  return result2;
}
function toArray(val) {
  if (Array.isArray(val)) return val.map(String);
  if (val !== void 0 && val !== true) return [String(val)];
  return [];
}
function zipAgentTask(argv) {
  const agents = toArray(argv.agent);
  const tasks = toArray(argv.task);
  return agents.map((a, i) => ({ agent: a, task: tasks[i] ?? "" }));
}
function parseCommand(command) {
  const [head, ...rest] = command.split(" -- ");
  const task = rest.join(" -- ").trim();
  const argv = parseArgs(head);
  const sub = String(argv._[0] ?? "");
  switch (sub) {
    case "run":
      return { type: "run", agent: String(argv._[1] ?? ""), task, main: Boolean(argv.main), cwd: argv.cwd ? String(argv.cwd) : void 0 };
    case "batch":
      return { type: "batch", items: zipAgentTask(argv), main: Boolean(argv.main) };
    case "chain":
      return { type: "chain", steps: zipAgentTask(argv), main: Boolean(argv.main) };
    case "continue":
      return { type: "continue", id: Number(argv._[1]), task };
    case "abort":
      return { type: "abort", id: Number(argv._[1]) };
    case "detail":
      return { type: "detail", id: Number(argv._[1]) };
    case "runs":
      return { type: "runs" };
    default:
      throw new Error(`Unknown subcommand: ${sub}`);
  }
}

// src/agents.ts
function parseFrontmatter(raw) {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) return { data: {}, content: raw };
  const data = {};
  for (const line of match[1].split("\n")) {
    const idx = line.indexOf(":");
    if (idx > 0) data[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }
  return { data, content: match[2].trim() };
}
function loadAgentFromString(raw, filePath) {
  const { data, content } = parseFrontmatter(raw);
  return {
    name: data.name ?? "",
    description: data.description ?? "",
    model: data.model || void 0,
    thinking: data.thinking || void 0,
    tools: data.tools ? data.tools.split(/,\s*/) : void 0,
    systemPrompt: content,
    filePath
  };
}
function loadAgentsFromDir(dir, readDir, readFile) {
  return readDir(dir).filter((f) => f.endsWith(".md")).map((f) => loadAgentFromString(readFile(`${dir}/${f}`, "utf-8"), `${dir}/${f}`));
}
function getAgent(name, agents) {
  return agents.find((a) => a.name === name);
}

// src/constants.ts
var MAX_CONCURRENCY = 8;
var MAX_RETRIES = 3;
var RETRY_BASE_MS = 2e3;
var ESCALATION_MARKER = "[ESCALATION]";
var PIPELINE_MAX_CHARS = 4e3;
var DEFAULT_HARD_TIMEOUT_MS = 20 * 6e4;
var DEFAULT_IDLE_TIMEOUT_MS = 5 * 6e4;
var TERMINATION_GRACE_MS = 5e3;

// src/execute.ts
function errorResult(agent, msg, task) {
  return { id: 0, agent, task, output: "", usage: { inputTokens: 0, outputTokens: 0, turns: 0 }, error: msg };
}
async function executeSingle(agent, task, opts) {
  return opts.runner(agent, task);
}
async function executeBatch(items, agents, opts) {
  const limit = opts.concurrency ?? MAX_CONCURRENCY;
  const results = [];
  const pending = /* @__PURE__ */ new Set();
  for (const item of items) {
    const agent = getAgent(item.agent, agents);
    if (!agent) {
      results.push(errorResult(item.agent, `Unknown agent: ${item.agent}`, item.task));
      continue;
    }
    const p = opts.runner(agent, item.task).then((r) => {
      results.push(r);
    }).catch((e) => {
      results.push(errorResult(item.agent, e.message, item.task));
    }).finally(() => {
      pending.delete(p);
    });
    pending.add(p);
    if (pending.size >= limit) await Promise.race(pending);
  }
  await Promise.all(pending);
  return results;
}
async function executeChain(steps, agents, opts) {
  let previous = "";
  let lastResult = errorResult("", "No steps");
  for (const step of steps) {
    const agent = getAgent(step.agent, agents);
    if (!agent) return errorResult(step.agent, `Unknown agent: ${step.agent}`, step.task);
    const task = step.task.replace("{previous}", previous.slice(0, PIPELINE_MAX_CHARS));
    lastResult = await opts.runner(agent, task);
    if (lastResult.escalation) return lastResult;
    if (lastResult.error) return lastResult;
    previous = lastResult.output;
  }
  return lastResult;
}

// src/store.ts
var counter = 0;
var active = /* @__PURE__ */ new Map();
function nextId() {
  return ++counter;
}
function addRun(run) {
  active.set(run.id, run);
}
function getRun(id) {
  return active.get(id);
}
function removeRun(id) {
  active.delete(id);
}
function listRuns() {
  return [...active.values()];
}

// src/session.ts
import { join } from "path";
import { homedir } from "os";
var history = [];
function sessionPath(id, home) {
  return join(home ?? homedir(), ".pi", "agent", "sessions", "subagents", `run-${id}.json`);
}
function addToHistory(item) {
  history.push(item);
}
function getRunHistory() {
  return [...history];
}
function buildRunsEntry() {
  return { runs: [...history], updatedAt: Date.now() };
}
function restoreRuns(entries) {
  const relevant = entries.filter(
    (e) => e.type === "custom" && "customType" in e && e.customType === "subagent-runs"
  );
  const last = relevant.at(-1);
  if (!last?.data || typeof last.data !== "object") {
    history = [];
    return;
  }
  const data = last.data;
  history = "runs" in data && Array.isArray(data.runs) ? [...data.runs] : [];
}
function getSessionFile(id) {
  return history.find((r) => r.id === id)?.sessionFile;
}

// src/format.ts
function formatTokens(n) {
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}k`;
  return String(n);
}
function formatUsage(stats) {
  return `${formatTokens(stats.inputTokens)} in / ${formatTokens(stats.outputTokens)} out / ${stats.turns} turns`;
}
function formatDuration(ms) {
  const sec = Math.floor(ms / 1e3);
  if (sec < 60) return `${sec}s`;
  return `${Math.floor(sec / 60)}m ${sec % 60}s`;
}
function singleLine(text) {
  return text.replace(/\s+/g, " ").trim();
}
function previewText(text, max = 80) {
  if (!text) return "";
  const normalized = singleLine(text);
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, Math.max(1, max - 1))}\u2026`;
}

// src/widget.ts
var MAX_VISIBLE = 3;
var SPINNER = "\u280B\u2819\u2839\u2838\u283C\u2834\u2826\u2827\u2807\u280F";
var IDLE_THRESHOLD_MS = 12e4;
var currentActivity = /* @__PURE__ */ new Map();
var lastEventTime = /* @__PURE__ */ new Map();
var frame = 0;
var timerCtx;
var timerRuns;
var timerId;
function setActivity(runId, activity) {
  lastEventTime.set(runId, Date.now());
  if (activity) currentActivity.set(runId, activity);
  else currentActivity.delete(runId);
}
function setCurrentTool(runId, toolName2, preview) {
  if (!toolName2) {
    setActivity(runId, void 0);
    return;
  }
  const detail = preview ? `${toolName2}: ${previewText(preview, 30)}` : toolName2;
  setActivity(runId, detail);
}
function setCurrentMessage(runId, preview) {
  setActivity(runId, preview ? `reply: ${previewText(preview, 30)}` : void 0);
}
function buildWidgetLines(runs, now) {
  const spin = SPINNER[frame % SPINNER.length];
  return runs.slice(0, MAX_VISIBLE).map((r) => {
    const elapsed = formatDuration(now - r.startedAt);
    const lastEvt = lastEventTime.get(r.id) ?? r.startedAt;
    const idle = now - lastEvt;
    const activity = currentActivity.get(r.id);
    const task = r.task ? ` \u2014 ${previewText(r.task, 28)}` : "";
    if (idle > IDLE_THRESHOLD_MS) {
      return `\u23F8 ${r.agent} #${r.id}${task} (${elapsed}) idle ${formatDuration(idle)}`;
    }
    const suffix = activity ? ` \u2192 ${activity}` : "";
    return `${spin} ${r.agent} #${r.id}${task} (${elapsed})${suffix}`;
  });
}
function syncWidget(ctx, runs) {
  if (!ctx.hasUI) return;
  if (runs.length === 0) {
    ctx.ui.setWidget("subagent-status", void 0);
    return;
  }
  ctx.ui.setWidget("subagent-status", buildWidgetLines(runs, Date.now()), { placement: "belowEditor" });
}
function startWidgetTimer(ctx, getRuns) {
  stopWidgetTimer();
  timerCtx = ctx;
  timerRuns = getRuns;
  timerId = setInterval(() => {
    frame++;
    if (timerCtx && timerRuns) syncWidget(timerCtx, timerRuns());
  }, 150);
}
function stopWidgetTimer() {
  if (timerId) {
    clearInterval(timerId);
    timerId = void 0;
  }
  timerCtx = void 0;
  timerRuns = void 0;
}
function clearToolState(runId) {
  currentActivity.delete(runId);
  lastEventTime.delete(runId);
}

// src/run-factory.ts
import { writeFileSync, existsSync, mkdirSync } from "fs";
import { tmpdir } from "os";
import { dirname, join as join2 } from "path";

// src/context.ts
function extractText(entry) {
  if (!entry.message?.content) return "";
  return entry.message.content.filter((c) => c.type === "text").map((c) => c.text ?? "").join("\n");
}
function extractMainContext(entries, maxMessages) {
  const typed = entries;
  const parts = [];
  const compaction = typed.find((e) => e.type === "compaction");
  if (compaction?.summary) parts.push(`[Context Summary]
${compaction.summary}`);
  const messages = typed.filter((e) => e.type === "message" && e.message);
  const recent = messages.slice(-maxMessages);
  for (const entry of recent) {
    const role = entry.message?.role ?? "unknown";
    const text = extractText(entry);
    if (text) parts.push(`[${role}] ${text}`);
  }
  return parts.join("\n\n");
}

// src/runner-output.ts
function collectOutput(events) {
  const finalTexts = [];
  const streamedTexts = [];
  const usage = { inputTokens: 0, outputTokens: 0, turns: 0 };
  let agentEndText = "", stopReason, lastToolName, lastToolText;
  for (const evt of events) {
    if (evt.type === "message" && evt.text !== void 0) {
      finalTexts.push(evt.text);
      usage.inputTokens += evt.usage?.inputTokens ?? 0;
      usage.outputTokens += evt.usage?.outputTokens ?? 0;
      usage.turns += evt.usage?.turns ?? 0;
      stopReason = evt.stopReason ?? stopReason;
    }
    if (evt.type === "message_delta" && evt.text) streamedTexts.push(evt.text);
    if ((evt.type === "tool_update" || evt.type === "tool_end") && evt.toolName) {
      lastToolName = evt.toolName;
      lastToolText = evt.text || lastToolText;
    }
    if (evt.type === "agent_end") {
      agentEndText = evt.text || agentEndText;
      stopReason = evt.stopReason ?? stopReason;
      if (usage.turns === 0) Object.assign(usage, {
        inputTokens: usage.inputTokens + (evt.usage?.inputTokens ?? 0),
        outputTokens: usage.outputTokens + (evt.usage?.outputTokens ?? 0),
        turns: usage.turns + (evt.usage?.turns ?? 0)
      });
    }
  }
  const finalOutput = finalTexts.join("\n");
  const streamOutput = streamedTexts.join("");
  const output = finalOutput || agentEndText || streamOutput;
  const source = finalOutput ? "message" : agentEndText ? "agent_end" : streamOutput ? "stream" : "empty";
  const escalation = output.includes(ESCALATION_MARKER) ? output.split(ESCALATION_MARKER)[1]?.trim() : void 0;
  return { output, usage, escalation, stopReason, source, lastToolName, lastToolText };
}
function buildMissingOutputDiagnostic(data) {
  const lines = ["Subagent finished without a visible assistant response.", `- source: ${data.source}`];
  if (data.stopReason) lines.push(`- stop reason: ${data.stopReason}`);
  if (data.exitCode !== null) lines.push(`- exit code: ${data.exitCode}`);
  if (data.lastToolName) lines.push(`- last tool: ${data.lastToolName}`);
  if (data.lastToolText) lines.push(`- last tool output: ${previewText(data.lastToolText, 160)}`);
  if (data.stderr) lines.push(`- stderr: ${previewText(data.stderr, 160)}`);
  return lines.join("\n");
}

// src/runner.ts
function getPiCommand(execPath, argv1, exists) {
  return argv1 && exists(argv1) ? { cmd: execPath, base: [argv1] } : { cmd: "pi", base: [] };
}
function buildArgs(input) {
  const args = [...input.base, "--mode", "json", "-p", ...input.sessionPath ? ["--session", input.sessionPath] : ["--no-session"]];
  if (input.model) args.push("--model", input.model);
  if (input.thinking) args.push("--thinking", input.thinking);
  if (input.tools) args.push("--tools", input.tools.join(","));
  args.push("--append-system-prompt", input.systemPromptPath, `Task: ${input.task}`);
  return args;
}

// src/run-progress.ts
var MAX_RECENT_LINES = 6;
function registerRun(id, agent, task, ctx, ac) {
  addRun({ id, agent, task, startedAt: Date.now(), abort: () => ac.abort() });
  if (listRuns().length === 1) startWidgetTimer(ctx, listRuns);
}
function unregisterRun(id) {
  clearToolState(id);
  removeRun(id);
  if (listRuns().length === 0) stopWidgetTimer();
}
function makeOnEvent(id, agent, task, ctx, collected, onUpdate) {
  const recent = [];
  let current = "starting", draft = "";
  const emit = () => onUpdate?.({ content: [{ type: "text", text: progressText(agent, id, task, current, recent) }], details: { isError: false } });
  const pushRecent = (line) => {
    recent.push(line);
    if (recent.length > MAX_RECENT_LINES) recent.shift();
  };
  return (evt) => {
    collected.push({ type: evt.type, text: evt.text, toolName: evt.toolName, isError: evt.isError, stopReason: evt.stopReason });
    if (evt.type === "tool_start") current = `running ${evt.toolName ?? "tool"}${evt.text ? `: ${previewText(evt.text, 72)}` : ""}`;
    if (evt.type === "tool_start") pushRecent(`\u2192 ${evt.toolName ?? "tool"}${evt.text ? `: ${previewText(evt.text, 96)}` : ""}`);
    if (evt.type === "tool_update" && evt.toolName) current = `${evt.toolName}${evt.text ? `: ${previewText(evt.text, 72)}` : ""}`;
    if (evt.type === "tool_end") current = `${evt.toolName ?? "tool"} ${evt.isError ? "failed" : "finished"}`;
    if (evt.type === "tool_end" && evt.text) pushRecent(`${evt.isError ? "\u2717" : "\u2713"} ${evt.toolName ?? "tool"}: ${previewText(evt.text, 96)}`);
    if (evt.type === "message_delta" && evt.text) {
      draft += evt.text;
      current = `drafting reply: ${previewText(draft, 72)}`;
    }
    if (evt.type === "message") current = evt.stopReason ? `reply ready (${evt.stopReason})` : "reply ready";
    if (evt.type === "message") pushRecent(`\u{1F4AC} ${previewText(evt.text, 120) || "(empty response)"}`);
    if (evt.type === "agent_end") current = evt.stopReason ? `finished (${evt.stopReason})` : "finished";
    if (evt.type === "agent_end" && evt.isError && evt.text) pushRecent(`\u2717 ${previewText(evt.text, 120)}`);
    if (evt.type === "tool_start" || evt.type === "tool_update") setCurrentTool(id, evt.toolName, evt.text);
    if (evt.type === "tool_end") setCurrentTool(id, void 0);
    if (["message_delta", "message", "agent_end"].includes(evt.type)) setCurrentMessage(id, evt.type === "message_delta" ? draft : evt.text);
    syncWidget(ctx, listRuns());
    emit();
  };
}
function progressText(agent, id, task, current, recent) {
  return [`\u23F3 ${agent} #${id} \u2014 ${previewText(task, 72)}`, `current: ${current}`, ...recent.map((line) => `  ${line}`)].join("\n");
}

// src/retry.ts
var TRANSIENT_PATTERNS = [/ECONNRESET/, /ETIMEDOUT/, /ENOTFOUND/, /429/, /5\d{2}/];
function isTransient(err) {
  return TRANSIENT_PATTERNS.some((p) => p.test(err.message));
}
async function withRetry(fn, maxRetries, baseMs) {
  let lastErr;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error(String(err));
      if (!isTransient(lastErr) || attempt === maxRetries) throw lastErr;
      await new Promise((r) => setTimeout(r, baseMs * 2 ** attempt));
    }
  }
  throw lastErr;
}

// src/spawn.ts
import { spawn } from "child_process";
import { createInterface } from "readline";

// src/parser-helpers.ts
var isRecord = (v) => typeof v === "object" && v !== null;
function parseUsage(message) {
  if (!message?.usage) return void 0;
  return {
    inputTokens: message.usage.inputTokens ?? 0,
    outputTokens: message.usage.outputTokens ?? 0,
    turns: 1
  };
}
function extractAssistantText(message) {
  if (!message || message.role !== "assistant") return "";
  return message.content?.filter((c) => c.type === "text").map((c) => c.text).join("\n") ?? "";
}
function extractToolText(result2) {
  if (!result2 || typeof result2 !== "object") return typeof result2 === "string" ? result2 : "";
  if (!("content" in result2) || !Array.isArray(result2.content)) return "";
  return result2.content.filter((c) => typeof c === "object" && c !== null).filter((c) => c.type === "text" && typeof c.text === "string").map((c) => c.text).join("\n");
}
function summarizeArgs(args) {
  if (!isRecord(args)) return typeof args === "string" ? previewText(args, 80) : "";
  const obj = args;
  for (const key of ["command", "path", "query", "tool", "server", "url", "text"]) {
    if (typeof obj[key] === "string" && obj[key]) return previewText(obj[key], 80);
  }
  return previewText(JSON.stringify(args), 80);
}
function parseAssistantUpdate(message, delta) {
  if (message?.role !== "assistant" || !delta?.type) return null;
  if (delta.type === "text_delta" && delta.delta) return { type: "message_delta", text: delta.delta };
  if (delta.type === "done") return { type: "agent_end", stopReason: delta.reason ?? message.stopReason };
  if (delta.type !== "error") return null;
  const err = typeof delta.error === "string" ? delta.error : delta.error?.message;
  return { type: "agent_end", stopReason: delta.reason ?? "error", text: err, isError: true };
}
function parseToolEvent(type, toolName2, data, isError) {
  const text = previewText(extractToolText(data), 120);
  if (type === "tool_start") return { type, toolName: toolName2, text: summarizeArgs(data) };
  return type === "tool_end" ? { type, toolName: toolName2, text, isError: !!isError } : { type, toolName: toolName2, text };
}

// src/parser-types.ts
var eventTypes = [
  "message_update",
  "message_end",
  "tool_execution_start",
  "tool_execution_update",
  "tool_execution_end",
  "agent_end"
];

// src/parser.ts
var isRecord2 = (v) => typeof v === "object" && v !== null;
var hasType = (v) => isRecord2(v) && typeof v.type === "string";
var isMessage = (v) => isRecord2(v);
var isAssistantEvent = (v) => isRecord2(v);
function parseMessageEnd(evt) {
  const message = isRecord2(evt) && isMessage(evt.message) ? evt.message : void 0;
  if (!message || message.role !== "assistant") return null;
  return { type: "message", text: extractAssistantText(message), usage: parseUsage(message), stopReason: message.stopReason };
}
function parseAgentEnd(evt) {
  const messages = isRecord2(evt) && Array.isArray(evt.messages) ? evt.messages.filter(isMessage) : [];
  const last = messages.filter((m) => m.role === "assistant").at(-1);
  return { type: "agent_end", text: extractAssistantText(last), usage: parseUsage(last), stopReason: last?.stopReason };
}
var toolName = (evt) => typeof evt.toolName === "string" ? evt.toolName : void 0;
var handlers = {
  message_update: (evt) => parseAssistantUpdate(isMessage(evt.message) ? evt.message : void 0, isAssistantEvent(evt.assistantMessageEvent) ? evt.assistantMessageEvent : void 0),
  message_end: parseMessageEnd,
  tool_execution_start: (evt) => parseToolEvent("tool_start", toolName(evt), evt.args),
  tool_execution_update: (evt) => parseToolEvent("tool_update", toolName(evt), evt.partialResult),
  tool_execution_end: (evt) => parseToolEvent("tool_end", toolName(evt), evt.result, evt.isError === true),
  agent_end: parseAgentEnd
};
function parseLine(line) {
  if (!line.trim()) return null;
  try {
    const evt = JSON.parse(line);
    if (!hasType(evt) || !eventTypes.includes(evt.type)) return null;
    return handlers[evt.type](evt);
  } catch {
    return null;
  }
}

// src/spawn.ts
function spawnAndCollect(cmd, args, id, agentName, signal, onEvent, options = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    const events = [];
    const stderrChunks = [];
    const rl = createInterface({ input: proc.stdout });
    let settled = false;
    let closed = false;
    let killTimer;
    let hardTimer;
    let idleTimer;
    const clearOptionalTimer = (timer) => {
      if (timer) clearTimeout(timer);
    };
    const cleanup = (keepKillTimer = false) => {
      if (!keepKillTimer) {
        clearOptionalTimer(killTimer);
        killTimer = void 0;
      }
      clearOptionalTimer(hardTimer);
      clearOptionalTimer(idleTimer);
      hardTimer = void 0;
      idleTimer = void 0;
      signal?.removeEventListener("abort", onAbort);
      rl.close();
    };
    const finishResolve = (result2) => {
      settled = true;
      cleanup();
      resolve(result2);
    };
    const finishReject = (err, keepKillTimer = false) => {
      settled = true;
      cleanup(keepKillTimer);
      reject(err);
    };
    const killProc = () => {
      proc.kill("SIGTERM");
      killTimer = setTimeout(() => {
        if (!closed) proc.kill("SIGKILL");
      }, TERMINATION_GRACE_MS);
    };
    const failForTimeout = (label, timeoutMs) => {
      if (settled) return;
      killProc();
      finishReject(new Error(`Subagent ${label} timeout after ${Math.ceil(timeoutMs / 1e3)}s`), true);
    };
    const scheduleIdleTimeout = () => {
      clearOptionalTimer(idleTimer);
      if (!options.idleTimeoutMs || options.idleTimeoutMs <= 0) return;
      idleTimer = setTimeout(() => failForTimeout("idle", options.idleTimeoutMs), options.idleTimeoutMs);
    };
    const onAbort = () => {
      if (settled) return;
      killProc();
      finishReject(new Error("Aborted"), true);
    };
    if (options.hardTimeoutMs && options.hardTimeoutMs > 0) {
      hardTimer = setTimeout(() => failForTimeout("hard", options.hardTimeoutMs), options.hardTimeoutMs);
    }
    scheduleIdleTimeout();
    if (signal?.aborted) {
      onAbort();
      return;
    }
    signal?.addEventListener("abort", onAbort, { once: true });
    rl.on("line", (line) => {
      scheduleIdleTimeout();
      const evt = parseLine(line);
      if (evt) {
        events.push(evt);
        onEvent?.(evt);
      }
    });
    proc.stderr.on("data", (chunk) => {
      stderrChunks.push(chunk.toString());
      scheduleIdleTimeout();
    });
    proc.on("error", (err) => {
      if (settled) return;
      finishReject(err);
    });
    proc.on("close", (code) => {
      closed = true;
      if (settled) {
        cleanup();
        return;
      }
      const summary = collectOutput(events);
      const stderr = stderrChunks.join("").trim();
      const result2 = {
        id,
        agent: agentName,
        output: summary.output,
        usage: summary.usage,
        escalation: summary.escalation,
        stopReason: summary.stopReason
      };
      if (code !== 0) {
        result2.error = stderr || `Process exited with code ${code}`;
        if (!result2.output) {
          result2.output = buildMissingOutputDiagnostic({ ...summary, stderr, exitCode: code });
        }
        finishResolve(result2);
        return;
      }
      if (!result2.output.trim()) {
        result2.error = "Subagent finished without a visible assistant result";
        result2.output = buildMissingOutputDiagnostic({ ...summary, stderr, exitCode: code });
      }
      finishResolve(result2);
    });
  });
}

// src/run-factory.ts
var errorMsg = (e) => e instanceof Error ? e.message : String(e);
var createRunner = (main, ctx, onUpdate, outerSignal) => async (agent, task) => {
  const id = nextId();
  return runAgent({ id, agent, task, ctx, onUpdate, outerSignal, sessionFile: sessionPath(id), prompt: buildPrompt(agent, ctx, main) });
};
var createSessionRunner = (sessFile, ctx, onUpdate, outerSignal) => async (agent, task) => {
  const id = nextId();
  return runAgent({ id, agent, task, ctx, onUpdate, outerSignal, sessionFile: sessFile });
};
async function runAgent(input) {
  const id = input.id;
  if (input.prompt) writeFileSync(join2(tmpdir(), `pi-sub-${input.agent.name}-${id}.md`), input.prompt);
  ensureSessionDir(input.sessionFile);
  const { cmd, args } = buildRunCommand(input.agent, input.task, input.sessionFile, input.prompt, id);
  const ac = new AbortController();
  const events = [];
  const abortFromOuter = () => ac.abort();
  let removeOuterAbortListener = () => {
  };
  if (input.outerSignal) {
    const outerSignal = input.outerSignal;
    removeOuterAbortListener = () => outerSignal.removeEventListener("abort", abortFromOuter);
    if (outerSignal.aborted) ac.abort();
    else outerSignal.addEventListener("abort", abortFromOuter, { once: true });
  }
  registerRun(id, input.agent.name, input.task, input.ctx, ac);
  const onEvent = makeOnEvent(id, input.agent.name, input.task, input.ctx, events, input.onUpdate);
  let result2;
  let failed = false;
  let failure;
  try {
    result2 = await withRetry(
      () => spawnAndCollect(cmd, args, id, input.agent.name, ac.signal, onEvent, {
        hardTimeoutMs: DEFAULT_HARD_TIMEOUT_MS,
        idleTimeoutMs: DEFAULT_IDLE_TIMEOUT_MS
      }),
      MAX_RETRIES,
      RETRY_BASE_MS
    );
  } catch (e) {
    failed = true;
    failure = e;
  }
  removeOuterAbortListener();
  if (failed) return failRun(failure, id, input.agent.name, input.task, input.sessionFile, events);
  return finishRun({ ...result2, task: input.task }, input.sessionFile, events);
}
function buildPrompt(agent, ctx, main) {
  if (!main) return agent.systemPrompt;
  const summary = extractMainContext(ctx.sessionManager.getBranch(), 20);
  return summary ? `${agent.systemPrompt}

[Main Context]
${summary}` : agent.systemPrompt;
}
function buildRunCommand(agent, task, sessionFile, prompt, id) {
  const { cmd, base } = getPiCommand(process.execPath, process.argv[1], existsSync);
  const promptPath = prompt ? join2(tmpdir(), `pi-sub-${agent.name}-${id}.md`) : "";
  const args = buildArgs({ base, model: agent.model, thinking: agent.thinking, tools: agent.tools, systemPromptPath: promptPath, task, sessionPath: sessionFile });
  if (!prompt) args.splice(args.indexOf("--append-system-prompt"), 2);
  return { cmd, args };
}
function ensureSessionDir(file) {
  const dir = dirname(file);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}
function finishRun(result2, sessionFile, events) {
  addToHistory({ id: result2.id, agent: result2.agent, task: result2.task, output: result2.output, error: result2.error, sessionFile, events });
  unregisterRun(result2.id);
  return result2;
}
function failRun(e, id, agent, task, sessionFile, events) {
  addToHistory({ id, agent, task, output: "", error: errorMsg(e), sessionFile, events });
  unregisterRun(id);
  throw e;
}

// src/dispatch.ts
async function dispatchRun(agent, task, ctx, main, onUpdate, signal) {
  const runner = createRunner(main, ctx, onUpdate, signal);
  try {
    return await executeSingle(agent, task, { runner });
  } finally {
    syncWidget(ctx, listRuns());
  }
}
async function dispatchBatch(items, agents, ctx, main, onUpdate, signal) {
  const runner = createRunner(main, ctx, onUpdate, signal);
  try {
    return await executeBatch(items, agents, { runner });
  } finally {
    syncWidget(ctx, listRuns());
  }
}
async function dispatchChain(steps, agents, ctx, main, onUpdate, signal) {
  const runner = createRunner(main, ctx, onUpdate, signal);
  try {
    return await executeChain(steps, agents, { runner });
  } finally {
    syncWidget(ctx, listRuns());
  }
}
function dispatchAbort(id) {
  const run = getRun(id);
  if (!run) return `Run #${id} not found`;
  run.abort();
  removeRun(id);
  return `Run #${id} (${run.agent}) aborted`;
}
async function dispatchContinue(id, task, agents, ctx, onUpdate, signal) {
  const hist = getRunHistory().find((r) => r.id === id);
  if (!hist) return `Run #${id} not found in history`;
  const sessFile = getSessionFile(id);
  if (!sessFile) return `Run #${id} not found in history`;
  const agent = getAgent(hist.agent, agents);
  if (!agent) return `Agent for run #${id} not found`;
  const runner = createSessionRunner(sessFile, ctx, onUpdate, signal);
  try {
    return await executeSingle(agent, task, { runner });
  } finally {
    syncWidget(ctx, listRuns());
  }
}
function onSessionRestore() {
  return async (_e, ctx) => {
    restoreRuns(ctx.sessionManager.getBranch());
    syncWidget(ctx, listRuns());
  };
}

// src/render.ts
import { truncateToWidth } from "@mariozechner/pi-tui";
function buildCallText(params) {
  try {
    const cmd = parseCommand(params.command);
    if (cmd.type === "run") return `\u25B6 subagent run ${cmd.agent} -- ${cmd.task}`;
    if (cmd.type === "batch") return `\u25B6 subagent batch (${cmd.items.length} tasks)`;
    if (cmd.type === "chain") return `\u25B6 subagent chain (${cmd.steps.length} steps)`;
    if (cmd.type === "continue") return `\u25B6 subagent continue #${cmd.id} -- ${cmd.task}`;
    if (cmd.type === "abort") return `\u25B6 subagent abort #${cmd.id}`;
    if (cmd.type === "detail") return `\u25B6 subagent detail #${cmd.id}`;
    return `\u25B6 subagent ${params.command}`;
  } catch {
    return `\u25B6 subagent ${params.command}`;
  }
}
function buildResultText(result2) {
  const header = `${result2.agent} #${result2.id}${result2.task ? ` \u2014 ${previewText(result2.task, 72)}` : ""}`;
  const footer = `${formatUsage(result2.usage)}${result2.stopReason ? ` / stop: ${result2.stopReason}` : ""}`;
  if (result2.error) {
    return `\u2717 ${header}
error: ${result2.error}${result2.output ? `

${result2.output}` : ""}

${footer}`;
  }
  if (result2.escalation) return `\u26A0 ${header} needs your input:
${result2.escalation}

Use: subagent continue ${result2.id} -- <your answer>`;
  return `\u2713 ${header}
${result2.output || "(no output)"}

${footer}`;
}
function textComponent(text) {
  const lines = text.split("\n");
  return {
    render(width) {
      const safeWidth = Math.max(0, width);
      return lines.map((line) => truncateToWidth(line, safeWidth));
    },
    invalidate() {
    }
  };
}
function renderCall(args) {
  return textComponent(buildCallText(args));
}
function renderResult(result2) {
  const text = result2.content.filter((c) => c.type === "text" && typeof c.text === "string").map((c) => c.text).join("\n");
  return textComponent(text);
}

// src/tool-report.ts
function formatRunsList() {
  const active2 = listRuns();
  const history2 = getRunHistory();
  const parts = [];
  if (active2.length) parts.push(`Active (${active2.length}):
${active2.map(formatRun).join("\n")}`);
  if (history2.length) parts.push(`History (${history2.length}):
${history2.map(formatRun).join("\n")}`);
  return parts.join("\n\n") || "No runs";
}
function formatRun(r) {
  return `  #${r.id} ${r.agent}${r.task ? ` \u2014 ${previewText(r.task, 80)}` : ""}${r.error ? " [error]" : ""}`;
}
function formatDetail(id) {
  const item = getRunHistory().find((r) => r.id === id);
  if (!item) return `Run #${id} not found`;
  const parts = [`# ${item.agent} #${id}`];
  if (item.task) parts.push(`task: ${item.task}`);
  if (item.sessionFile) parts.push(`session: ${item.sessionFile}`);
  parts.push(item.error ? `status: error \u2014 ${item.error}` : "status: ok");
  if (item.events?.length) parts.push("events:", ...item.events.flatMap(formatEvent));
  if (item.output) parts.push("", "output:", item.output);
  else if (!item.events?.length) parts.push("(no output)");
  return parts.join("\n");
}
function formatEvent(evt) {
  if (evt.type === "tool_start") return [`  \u2192 ${evt.toolName}${evt.text ? `: ${previewText(evt.text, 120)}` : ""}`];
  if (evt.type === "tool_update" && evt.text) return [`  \u21B3 ${evt.toolName ?? "tool"}: ${previewText(evt.text, 120)}`];
  if (evt.type === "tool_end") return [`  ${evt.isError ? "\u2717" : "\u2713"} ${evt.toolName ?? "tool"}${evt.text ? `: ${previewText(evt.text, 120)}` : ""}`];
  if (evt.type === "message_delta" && evt.text) return [`  \u2026 ${previewText(evt.text, 120)}`];
  if (evt.type === "message" && evt.text) return [`  \u{1F4AC} ${evt.text}`];
  if (evt.type === "agent_end" && evt.stopReason) return [`  done: ${evt.stopReason}`];
  return [];
}

// src/types.ts
import { Type } from "@sinclair/typebox";
var SubagentParams = Type.Object({
  command: Type.String({ description: "Subcommand string (e.g. 'run scout -- find auth code')" })
});

// src/tool.ts
var result = (text, isError = false) => ({ content: [{ type: "text", text }], details: { isError } });
var errorMsg2 = (e) => e instanceof Error ? e.message : String(e);
async function dispatch(cmd, agents, ctx, onUpdate, signal) {
  if (cmd.type === "runs") return result(formatRunsList());
  if (cmd.type === "detail") return result(formatDetail(cmd.id));
  if (cmd.type === "abort") return result(dispatchAbort(cmd.id));
  if (cmd.type === "run") return runSingle(cmd, agents, ctx, onUpdate, signal);
  if (cmd.type === "batch") return runBatch(cmd, agents, ctx, onUpdate, signal);
  if (cmd.type === "chain") return runChain(cmd, agents, ctx, onUpdate, signal);
  const cont = await dispatchContinue(cmd.id, cmd.task, agents, ctx, onUpdate, signal);
  return typeof cont === "string" ? result(cont, cont.includes("not found")) : result(buildResultText(cont), !!cont.error);
}
async function runSingle(cmd, agents, ctx, onUpdate, signal) {
  const agent = getAgent(cmd.agent, agents);
  if (!agent) return result(`Unknown agent: ${cmd.agent}`, true);
  const out = await dispatchRun(agent, cmd.task, ctx, cmd.main, onUpdate, signal);
  return result(buildResultText(out), !!out.error);
}
var runBatch = async (cmd, agents, ctx, onUpdate, signal) => {
  const out = await dispatchBatch(cmd.items, agents, ctx, cmd.main, onUpdate, signal);
  return result(out.map((r) => buildResultText(r)).join("\n---\n"), out.some((r) => !!r.error));
};
var runChain = async (cmd, agents, ctx, onUpdate, signal) => {
  const out = await dispatchChain(cmd.steps, agents, ctx, cmd.main, onUpdate, signal);
  return result(buildResultText(out), !!out.error);
};
var snippet = (agents) => `Dispatch subagents: ${agents.map((a) => `${a.name} (${a.description})`).join(", ") || "none loaded"}`;
var guidelines = (agents) => ["Available agents:", ...agents.map((a) => `  - ${a.name}: ${a.description}`), "Command: run <agent> [--main] -- <task>", "Batch: batch --agent <a> --task <t> [--agent <a> --task <t> ...]", "Chain: chain --agent <a> --task <t> --agent <a> --task '{previous}'", "Manage: continue <id> -- <task>, abort <id>, detail <id>, runs", "The tool blocks until the subagent completes and returns the full result."];
function createTool(pi, agentsDir) {
  const agents = existsSync2(agentsDir) ? loadAgentsFromDir(agentsDir, (d) => readdirSync(d).map(String), readFileSync) : [];
  return defineTool({
    name: "subagent",
    label: "Subagent",
    description: "Run isolated subagent processes in separate pi subprocesses with their own context window",
    promptSnippet: snippet(agents),
    promptGuidelines: guidelines(agents),
    parameters: SubagentParams,
    async execute(_id, params, signal, onUpdate, ctx) {
      try {
        return await dispatch(parseCommand(params.command), agents, ctx, onUpdate, signal);
      } catch (e) {
        return result(`Error: ${errorMsg2(e)}`, true);
      }
    },
    renderCall: (args) => renderCall(args),
    renderResult: (res) => renderResult(res)
  });
}

// src/commands.ts
import { readdirSync as readdirSync2, readFileSync as readFileSync2, existsSync as existsSync3 } from "fs";
function buildHelpText(agentsDir) {
  const agents = existsSync3(agentsDir) ? loadAgentsFromDir(agentsDir, (d) => readdirSync2(d).map(String), readFileSync2) : [];
  const lines = [
    "subagent \u2014 \uC11C\uBE0C\uC5D0\uC774\uC804\uD2B8 \uC624\uCF00\uC2A4\uD2B8\uB808\uC774\uC158",
    "",
    "\uC0AC\uC6A9\uBC95:",
    "  /sub run <agent> [--main] -- <task>    \uC5D0\uC774\uC804\uD2B8 \uC2E4\uD589",
    "  /sub batch --agent <a> --task <t> ...  \uBCD1\uB82C \uC2E4\uD589",
    "  /sub chain --agent <a> --task <t> ...  \uC21C\uCC28 \uC2E4\uD589",
    "  /sub continue <id> -- <task>           \uC138\uC158 \uC774\uC5B4\uD558\uAE30",
    "  /sub abort <id>                        \uC2E4\uD589 \uC911\uB2E8",
    "  /sub detail <id>                       \uC0C1\uC138 \uD788\uC2A4\uD1A0\uB9AC",
    "  /sub runs                              \uC2E4\uD589 \uBAA9\uB85D",
    "",
    "\uC5D0\uC774\uC804\uD2B8:",
    ...agents.map((a) => `  ${a.name.padEnd(18)} ${a.description}`)
  ];
  return lines.join("\n");
}
function buildSubCommand(agentsDir, sendUserMessage) {
  return {
    description: "\uC11C\uBE0C\uC5D0\uC774\uC804\uD2B8 \uBA85\uB839 (run, batch, chain, continue, abort, detail, runs)",
    handler: async (args, ctx) => {
      if (!args.trim()) {
        ctx.ui.notify(buildHelpText(agentsDir), "info");
        return;
      }
      sendUserMessage(`Use the subagent tool with command: ${args}`);
    }
  };
}

// src/index.ts
import { dirname as dirname2, join as join3 } from "path";
import { fileURLToPath } from "url";
function index_default(pi) {
  pi.on("session_start", onSessionRestore());
  pi.on("session_tree", onSessionRestore());
  pi.on("agent_end", async (_event, ctx) => {
    pi.appendEntry("subagent-runs", buildRunsEntry());
    syncWidget(ctx, listRuns());
  });
  pi.registerTool(createTool(pi, join3(dirname2(fileURLToPath(import.meta.url)), "..", "agents")));
  pi.registerCommand("sub", buildSubCommand(join3(dirname2(fileURLToPath(import.meta.url)), "..", "agents"), (c, o) => pi.sendUserMessage(c, o)));
}
export {
  index_default as default
};
