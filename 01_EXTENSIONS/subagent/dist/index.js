// src/tool.ts
import { defineTool } from "@mariozechner/pi-coding-agent";
import { existsSync as existsSync2, readdirSync, readFileSync } from "fs";

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
function restoreRuns(entries2) {
  const relevant = entries2.filter(
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

// src/widget-view.ts
import { truncateToWidth } from "@mariozechner/pi-tui";

// src/widget-state.ts
var activity = /* @__PURE__ */ new Map();
var lastEvent = /* @__PURE__ */ new Map();
var nested = /* @__PURE__ */ new Map();
var getActivity = (runId) => activity.get(runId);
var getLastEventTime = (runId) => lastEvent.get(runId);
var getNestedRuns = (runId) => nested.get(runId) ?? [];
function setActivity(runId, value) {
  lastEvent.set(runId, Date.now());
  if (value) activity.set(runId, value);
  else activity.delete(runId);
}
function setNestedRunsState(runId, runs) {
  if (!runs?.length) {
    nested.delete(runId);
    return;
  }
  nested.set(runId, runs.map((run) => ({ ...run })));
}
var clearNestedRunsState = (runId) => void nested.delete(runId);
function clearToolStateState(runId) {
  activity.delete(runId);
  lastEvent.delete(runId);
}

// src/widget-view.ts
var VISIBLE_ROOTS = 3;
var SCROLL_FRAMES_PER_STEP = 10;
var IDLE_MS = 12e4;
var SPINNER = "\u280B\u2819\u2839\u2838\u283C\u2834\u2826\u2827\u2807\u280F";
var offset = (runs, depth) => runs.map((run) => ({ ...run, depth: run.depth + depth }));
var snapshots = (run) => [{
  id: run.id,
  agent: run.agent,
  task: run.task,
  startedAt: run.startedAt,
  depth: 1,
  activity: getActivity(run.id),
  lastEventAt: getLastEventTime(run.id)
}, ...offset(getNestedRuns(run.id), 1)];
var visibleRoots = (runs, frame2) => runs.length <= VISIBLE_ROOTS ? runs : Array.from({ length: VISIBLE_ROOTS }, (_, i) => runs[(Math.floor(frame2 / SCROLL_FRAMES_PER_STEP) + i) % runs.length]).filter(Boolean);
function display(run, now, spin) {
  const last = run.depth > 0 ? run.lastEventAt ?? run.startedAt : run.lastEventAt ?? getLastEventTime(run.id) ?? run.startedAt;
  const idle = now - last > IDLE_MS, branch = run.depth > 0 ? `${"  ".repeat(run.depth - 1)}\u21B3 ` : "";
  const activity2 = run.depth > 0 ? run.activity : run.activity ?? getActivity(run.id);
  const task = run.task ? ` \u2014 ${previewText(run.task, 28)}` : "", prefix = idle ? "\u23F8" : spin;
  const suffix = idle ? ` idle ${formatDuration(now - last)}` : activity2 ? ` \u2192 ${activity2}` : "";
  return { text: `${branch}${prefix} ${run.agent} #${run.id}${task} (${formatDuration(now - run.startedAt)})${suffix}`, depth: run.depth, idle };
}
function entries(runs, now, frame2) {
  const roots = visibleRoots(runs, frame2), spin = SPINNER[frame2 % SPINNER.length];
  const shown = roots.flatMap((run) => [{ ...run, depth: 0, activity: getActivity(run.id), lastEventAt: getLastEventTime(run.id) }, ...getNestedRuns(run.id)]);
  const info = runs.length <= VISIBLE_ROOTS || roots.length === 0 ? void 0 : { text: `\u21C5 roots ${roots.map((_, i) => (runs.findIndex((run) => run.id === roots[0]?.id) + i) % runs.length + 1).join(",")} / ${runs.length}`, depth: 0, idle: false, meta: true };
  return [...shown.map((run) => display(run, now, spin)), ...info ? [info] : []];
}
var tone = (entry) => entry.meta ? "dim" : entry.idle ? entry.depth === 0 ? "warning" : "dim" : entry.depth === 0 ? "accent" : entry.depth === 1 ? "muted" : "dim";
var buildNestedRunSnapshotsForRun = (run) => run ? snapshots(run) : [];
function buildWidgetComponent(runs, now, frame2) {
  const rendered = entries(runs, now, frame2);
  return (_tui, theme) => ({
    render(width) {
      return rendered.map((entry) => truncateToWidth(theme.fg(tone(entry), entry.text), Math.max(0, width)));
    },
    invalidate() {
    }
  });
}

// src/widget.ts
var frame = 0;
var timerCtx;
var timerRuns;
var timerId;
var completedWidget;
function setCurrentTool(runId, toolName2, preview) {
  if (!toolName2) {
    setActivity(runId, void 0);
    return;
  }
  setActivity(runId, preview ? `${toolName2}: ${previewText(preview, 30)}` : toolName2);
}
var setCurrentMessage = (runId, preview) => setActivity(runId, preview ? `reply: ${previewText(preview, 30)}` : void 0);
var setNestedRuns = (runId, runs) => setNestedRunsState(runId, runs);
var clearNestedRuns = (runId) => clearNestedRunsState(runId);
var buildNestedRunSnapshotsForRunId = buildNestedRunSnapshotsForRun;
function rememberCompletedWidget(runs) {
  if (runs.length === 0) return;
  completedWidget = buildWidgetComponent(runs, Date.now(), frame);
}
function syncWidget(ctx, runs) {
  if (!ctx.hasUI) return;
  if (runs.length === 0) {
    ctx.ui.setWidget("subagent-status", completedWidget, completedWidget ? { placement: "belowEditor" } : void 0);
    return;
  }
  completedWidget = void 0;
  ctx.ui.setWidget("subagent-status", buildWidgetComponent(runs, Date.now(), frame), { placement: "belowEditor" });
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
  clearToolStateState(runId);
}

// src/run-factory.ts
import { writeFileSync } from "fs";
import { tmpdir as tmpdir2 } from "os";
import { join as join3 } from "path";

// src/run-tree.ts
function statusForResult(result2) {
  if (result2.error) return "error";
  if (result2.escalation) return "escalation";
  return "ok";
}
function resultToRunTree(result2) {
  return {
    id: result2.id,
    agent: result2.agent,
    task: result2.task,
    status: statusForResult(result2),
    stopReason: result2.stopReason,
    error: result2.error,
    outputPreview: previewText(result2.escalation ?? result2.output, 120),
    children: result2.runTrees?.map((child) => ({ ...child }))
  };
}
function treeIcon(status) {
  if (status === "error") return "\u2717";
  if (status === "escalation") return "\u26A0";
  return "\u2713";
}
function treeSuffix(tree) {
  if (tree.status === "error" && tree.error) return ` \u2014 ${previewText(tree.error, 80)}`;
  if (tree.status === "escalation" && tree.outputPreview) return ` \u2014 ${previewText(tree.outputPreview, 80)}`;
  if (tree.stopReason) return ` (${tree.stopReason})`;
  return "";
}
function formatTreeLabel(tree) {
  const task = tree.task ? ` \u2014 ${previewText(tree.task, 60)}` : "";
  return `${treeIcon(tree.status)} ${tree.agent} #${tree.id}${task}${treeSuffix(tree)}`;
}
function formatRunTree(tree, prefix, isLast) {
  const branch = `${prefix}${isLast ? "\u2514\u2500" : "\u251C\u2500"}`;
  const childPrefix = `${prefix}${isLast ? "  " : "\u2502 "}`;
  const children = tree.children ?? [];
  const lines = [`${branch}${formatTreeLabel(tree)}`];
  for (const [index, child] of children.entries()) {
    lines.push(...formatRunTree(child, childPrefix, index === children.length - 1));
  }
  return lines;
}
function formatRunTrees(trees) {
  if (!trees || trees.length === 0) return [];
  return trees.flatMap((tree, index) => formatRunTree(tree, "", index === trees.length - 1));
}
function isRunTree(value) {
  if (typeof value !== "object" || value === null) return false;
  const tree = value;
  if (typeof tree.id !== "number" || typeof tree.agent !== "string") return false;
  if (tree.task !== void 0 && typeof tree.task !== "string") return false;
  if (tree.status !== "ok" && tree.status !== "error" && tree.status !== "escalation") return false;
  if (tree.stopReason !== void 0 && typeof tree.stopReason !== "string") return false;
  if (tree.error !== void 0 && typeof tree.error !== "string") return false;
  if (tree.outputPreview !== void 0 && typeof tree.outputPreview !== "string") return false;
  if (tree.children !== void 0) {
    if (!Array.isArray(tree.children)) return false;
    if (!tree.children.every(isRunTree)) return false;
  }
  return true;
}

// src/tool-names.ts
var SUBAGENT_TOOL_PREFIX = "subagent_";
var suffixes = ["run", "batch", "chain", "continue", "abort", "detail", "runs"];
var subagentToolKinds = [...suffixes];
var subagentToolName = (kind) => `${SUBAGENT_TOOL_PREFIX}${kind}`;
function isSubagentToolName(name) {
  return typeof name === "string" && (name === "subagent" || suffixes.some((suffix) => name === subagentToolName(suffix)));
}

// src/run-progress.ts
var MAX_RECENT_LINES = 8;
function registerRun(id, agent, task, ctx, ac) {
  addRun({ id, agent, task, startedAt: Date.now(), abort: () => ac.abort() });
  if (listRuns().length === 1) startWidgetTimer(ctx, listRuns);
}
function unregisterRun(id) {
  const runs = listRuns();
  if (runs.length === 1 && runs[0]?.id === id) rememberCompletedWidget(runs);
  clearNestedRuns(id);
  clearToolState(id);
  removeRun(id);
  if (listRuns().length === 0) stopWidgetTimer();
}
function makeOnEvent(id, agent, task, ctx, collected, onUpdate) {
  const recent = [];
  let current = "starting", draft = "";
  const emit = () => {
    const currentRun = listRuns().find((run) => run.id === id);
    const activeRuns = buildNestedRunSnapshotsForRunId(currentRun);
    onUpdate?.({
      content: [{ type: "text", text: progressText(agent, id, task, current, recent, activeRuns) }],
      details: { isError: false, activeRuns }
    });
  };
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
    if (isSubagentToolName(evt.toolName)) {
      if (evt.type === "tool_update") setNestedRuns(id, evt.nestedRuns);
      if (evt.type === "tool_end") {
        clearNestedRuns(id);
        for (const line of formatRunTrees(evt.runTrees).slice(0, 4)) pushRecent(`nested ${line}`);
      }
    }
    syncWidget(ctx, listRuns());
    emit();
  };
}
function progressText(agent, id, task, current, recent, activeRuns) {
  return [
    `\u23F3 ${agent} #${id} \u2014 ${previewText(task, 72)}`,
    `current: ${current}`,
    ...recent.map((line) => `  ${line}`),
    ...nestedProgress(activeRuns, id)
  ].join("\n");
}
function nestedProgress(activeRuns, currentRunId) {
  return activeRuns.filter((run) => run.id !== currentRunId).map((run) => {
    const indent = `${"  ".repeat(Math.max(0, run.depth - 1))}\u21B3 `;
    const task = run.task ? ` \u2014 ${previewText(run.task, 36)}` : "";
    const activity2 = run.activity ? ` \u2192 ${previewText(run.activity, 30)}` : "";
    return `nested: ${indent}${run.agent} #${run.id}${task}${activity2}`;
  });
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
function isNestedRunSnapshot(value) {
  if (!isRecord(value)) return false;
  return typeof value.id === "number" && typeof value.agent === "string" && typeof value.startedAt === "number" && typeof value.depth === "number" && (value.task === void 0 || typeof value.task === "string") && (value.activity === void 0 || typeof value.activity === "string") && (value.lastEventAt === void 0 || typeof value.lastEventAt === "number");
}
function extractNestedRuns(result2) {
  if (!isRecord(result2) || !isRecord(result2.details) || !Array.isArray(result2.details.activeRuns)) return void 0;
  const runs = result2.details.activeRuns.filter(isNestedRunSnapshot);
  return runs.length === result2.details.activeRuns.length ? runs : void 0;
}
function extractRunTrees(result2) {
  if (!isRecord(result2) || !isRecord(result2.details) || !Array.isArray(result2.details.runTrees)) return void 0;
  const trees = result2.details.runTrees.filter(isRunTree);
  return trees.length === result2.details.runTrees.length ? trees : void 0;
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
  const nestedRuns = extractNestedRuns(data);
  const runTrees = type === "tool_end" ? extractRunTrees(data) : void 0;
  const nested2 = nestedRuns ? { nestedRuns } : {};
  const completed = runTrees ? { runTrees } : {};
  return type === "tool_end" ? { type, toolName: toolName2, text, isError: !!isError, ...nested2, ...completed } : { type, toolName: toolName2, text, ...nested2 };
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

// src/runner-output.ts
function collectOutput(events) {
  const finalTexts = [];
  const streamedTexts = [];
  const usage = { inputTokens: 0, outputTokens: 0, turns: 0 };
  const runTrees = [];
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
    if (evt.type === "tool_end" && evt.runTrees?.length) runTrees.push(...evt.runTrees);
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
  return { output, usage, escalation, stopReason, source, lastToolName, lastToolText, runTrees };
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

// src/spawn-support.ts
function clearOptionalTimer(timer) {
  if (timer) clearTimeout(timer);
}
function killWithGrace(proc, isClosed, setKillTimer) {
  proc.kill("SIGTERM");
  setKillTimer(setTimeout(() => {
    if (!isClosed()) proc.kill("SIGKILL");
  }, TERMINATION_GRACE_MS));
}
function buildResult(id, agentName, events, stderrChunks, code) {
  const summary = collectOutput(events);
  const stderr = stderrChunks.join("").trim();
  const result2 = {
    id,
    agent: agentName,
    output: summary.output,
    usage: summary.usage,
    escalation: summary.escalation,
    stopReason: summary.stopReason,
    runTrees: summary.runTrees
  };
  if (code !== 0) {
    result2.error = stderr || `Process exited with code ${code}`;
    if (!result2.output) result2.output = buildMissingOutputDiagnostic({ ...summary, stderr, exitCode: code });
    return result2;
  }
  if (!result2.output.trim()) {
    result2.error = "Subagent finished without a visible assistant result";
    result2.output = buildMissingOutputDiagnostic({ ...summary, stderr, exitCode: code });
  }
  return result2;
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
    const killProc = () => killWithGrace(proc, () => closed, (timer) => {
      killTimer = timer;
    });
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
    if (signal?.aborted) return onAbort();
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
      if (!settled) finishReject(err);
    });
    proc.on("close", (code) => {
      closed = true;
      if (settled) return cleanup();
      finishResolve(buildResult(id, agentName, events, stderrChunks, code));
    });
  });
}

// src/run-factory-support.ts
import { existsSync, mkdirSync } from "fs";
import { tmpdir } from "os";
import { dirname, join as join2 } from "path";

// src/context.ts
function extractText(entry) {
  if (!entry.message?.content) return "";
  return entry.message.content.filter((c) => c.type === "text").map((c) => c.text ?? "").join("\n");
}
function extractMainContext(entries2, maxMessages) {
  const typed = entries2;
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

// src/run-factory-support.ts
var errorMsg = (e) => e instanceof Error ? e.message : String(e);
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
  addToHistory({ id: result2.id, agent: result2.agent, task: result2.task, output: result2.output, error: result2.error, sessionFile, events, runTrees: result2.runTrees });
  unregisterRun(result2.id);
  return result2;
}
function failRun(e, id, agent, task, sessionFile, events) {
  addToHistory({ id, agent, task, output: "", error: errorMsg(e), sessionFile, events, runTrees: void 0 });
  unregisterRun(id);
  throw e;
}

// src/run-factory.ts
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
  if (input.prompt) writeFileSync(join3(tmpdir2(), `pi-sub-${input.agent.name}-${id}.md`), input.prompt);
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
import { truncateToWidth as truncateToWidth2 } from "@mariozechner/pi-tui";

// src/cli-args.ts
function tokenize(input) {
  const tokens = [];
  let current = "";
  let quote;
  let escaping = false;
  let tokenStarted = false;
  const push = () => {
    if (tokenStarted) tokens.push(current);
    current = "";
    tokenStarted = false;
  };
  for (const ch of input) {
    if (escaping) {
      current += ch;
      escaping = false;
      tokenStarted = true;
      continue;
    }
    if (quote) {
      if (quote === "single" && ch === "'" || quote === "double" && ch === '"') {
        quote = void 0;
        continue;
      }
      if (ch === "\\") {
        escaping = true;
        continue;
      }
      current += ch;
      tokenStarted = true;
      continue;
    }
    if (/\s/.test(ch)) {
      push();
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch === "'" ? "single" : "double";
      tokenStarted = true;
      continue;
    }
    if (ch === "\\") {
      escaping = true;
      tokenStarted = true;
      continue;
    }
    current += ch;
    tokenStarted = true;
  }
  if (escaping) throw new Error("Unterminated escape sequence");
  if (quote) throw new Error(`Unterminated ${quote} quote`);
  push();
  return tokens;
}
function toArray(value) {
  if (Array.isArray(value)) return value.map(String);
  if (value !== void 0 && value !== true) return [String(value)];
  return [];
}
function parseArgs(input) {
  const parsed = { _: [] };
  const tokens = tokenize(input);
  for (const [index, token] of tokens.entries()) {
    if (!token.startsWith("--")) {
      parsed._.push(token);
      continue;
    }
    const key = token.slice(2);
    const next = tokens[index + 1];
    if (!next || next.startsWith("--")) parsed[key] = true;
  }
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = tokens[i + 1];
    if (!next || next.startsWith("--")) continue;
    i++;
    const prev = parsed[key];
    if (Array.isArray(prev)) prev.push(next);
    else if (prev !== void 0 && prev !== true) parsed[key] = [prev, next];
    else parsed[key] = next;
  }
  return parsed;
}
function zipAgentTask(argv) {
  const agents = toArray(argv.agent);
  const tasks2 = toArray(argv.task);
  return agents.map((agent, index) => ({ agent, task: tasks2[index] ?? "" }));
}

// src/cli.ts
function parseCommand(command) {
  const [head, ...rest] = command.split(" -- ");
  const task = rest.join(" -- ").trim();
  const argv = parseArgs(head);
  switch (String(argv._[0] ?? "")) {
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
      throw new Error(`Unknown subcommand: ${String(argv._[0] ?? "")}`);
  }
}
function subcommandToToolCall(cmd) {
  switch (cmd.type) {
    case "run":
      return { toolName: subagentToolName("run"), input: toRunInput(cmd) };
    case "batch":
      return { toolName: subagentToolName("batch"), input: toBatchInput(cmd) };
    case "chain":
      return { toolName: subagentToolName("chain"), input: toChainInput(cmd) };
    case "continue":
      return { toolName: subagentToolName("continue"), input: { id: cmd.id, task: cmd.task } };
    case "abort":
      return { toolName: subagentToolName("abort"), input: { id: cmd.id } };
    case "detail":
      return { toolName: subagentToolName("detail"), input: { id: cmd.id } };
    case "runs":
      return { toolName: subagentToolName("runs"), input: {} };
  }
}
function stringifyCommand(cmd) {
  switch (cmd.type) {
    case "run":
      return `run ${cmd.agent}${cmd.main ? " --main" : ""}${cmd.cwd ? ` --cwd ${JSON.stringify(cmd.cwd)}` : ""} -- ${cmd.task}`;
    case "batch":
      return `batch${cmd.main ? " --main" : ""}${cmd.items.map((item) => ` --agent ${JSON.stringify(item.agent)} --task ${JSON.stringify(item.task)}`).join("")}`;
    case "chain":
      return `chain${cmd.main ? " --main" : ""}${cmd.steps.map((step) => ` --agent ${JSON.stringify(step.agent)} --task ${JSON.stringify(step.task)}`).join("")}`;
    case "continue":
      return `continue ${cmd.id} -- ${cmd.task}`;
    case "abort":
      return `abort ${cmd.id}`;
    case "detail":
      return `detail ${cmd.id}`;
    case "runs":
      return "runs";
  }
}
function toRunInput(cmd) {
  return { agent: cmd.agent, task: cmd.task, ...cmd.main ? { main: true } : {}, ...cmd.cwd ? { cwd: cmd.cwd } : {} };
}
function toBatchInput(cmd) {
  return { items: cmd.items, ...cmd.main ? { main: true } : {} };
}
function toChainInput(cmd) {
  return { steps: cmd.steps, ...cmd.main ? { main: true } : {} };
}

// src/render.ts
function buildCallText(cmd) {
  if (cmd.type === "run") return `\u25B6 subagent run ${cmd.agent} -- ${cmd.task}`;
  if (cmd.type === "batch") return `\u25B6 subagent batch (${cmd.items.length} tasks)`;
  if (cmd.type === "chain") return `\u25B6 subagent chain (${cmd.steps.length} steps)`;
  if (cmd.type === "continue") return `\u25B6 subagent continue #${cmd.id} -- ${cmd.task}`;
  if (cmd.type === "abort") return `\u25B6 subagent abort #${cmd.id}`;
  if (cmd.type === "detail") return `\u25B6 subagent detail #${cmd.id}`;
  return `\u25B6 subagent ${stringifyCommand(cmd)}`;
}
function buildResultText(result2) {
  const header = `${result2.agent} #${result2.id}${result2.task ? ` \u2014 ${previewText(result2.task, 72)}` : ""}`;
  const footer = `${formatUsage(result2.usage)}${result2.stopReason ? ` / stop: ${result2.stopReason}` : ""}`;
  const tree = formatRunTrees(result2.runTrees);
  const treeSection = tree.length > 0 ? `

nested runs:
${tree.join("\n")}` : "";
  if (result2.error) return `\u2717 ${header}
error: ${result2.error}${result2.output ? `

${result2.output}` : ""}${treeSection}

${footer}`;
  if (result2.escalation) return `\u26A0 ${header} needs your input:
${result2.escalation}${treeSection}

Use: subagent continue ${result2.id} -- <your answer>`;
  return `\u2713 ${header}
${result2.output || "(no output)"}${treeSection}

${footer}`;
}
var textComponent = (text) => ({ render(width) {
  return text.split("\n").map((line) => truncateToWidth2(line, Math.max(0, width)));
}, invalidate() {
} });
var renderCallForCommand = (cmd) => textComponent(buildCallText(cmd));
function renderResult(result2) {
  return textComponent(result2.content.filter((item) => item.type === "text" && typeof item.text === "string").map((item) => item.text).join("\n"));
}

// src/tool-report.ts
function formatRunsList() {
  const active2 = listRuns();
  const history2 = getRunHistory();
  const parts = [];
  if (active2.length) parts.push(`Active (${active2.length}):
${active2.map(formatRunSummary).join("\n")}`);
  if (history2.length) parts.push(`History (${history2.length}):
${history2.map(formatHistoryRun).join("\n")}`);
  return parts.join("\n\n") || "No runs";
}
function formatRunSummary(r) {
  return `  #${r.id} ${r.agent}${r.task ? ` \u2014 ${previewText(r.task, 80)}` : ""}${r.error ? " [error]" : ""}`;
}
function formatHistoryRun(r) {
  const lines = [formatRunSummary(r)];
  if (Array.isArray(r.runTrees) && r.runTrees.length > 0) {
    lines.push(...formatRunTrees(r.runTrees).map((line) => `    ${line}`));
  }
  return lines.join("\n");
}
function formatDetail(id) {
  const item = getRunHistory().find((r) => r.id === id);
  if (!item) return `Run #${id} not found`;
  const parts = [`# ${item.agent} #${id}`];
  if (item.task) parts.push(`task: ${item.task}`);
  if (item.sessionFile) parts.push(`session: ${item.sessionFile}`);
  parts.push(item.error ? `status: error \u2014 ${item.error}` : "status: ok");
  if (item.events?.length) parts.push("events:", ...item.events.flatMap(formatEvent));
  if (item.runTrees?.length) parts.push("nested runs:", ...formatRunTrees(item.runTrees).map((line) => `  ${line}`));
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

// src/params.ts
import { Type } from "@sinclair/typebox";
var AgentTaskItem = Type.Object({
  agent: Type.String({ description: "Subagent name" }),
  task: Type.String({ description: "Full task text for that subagent" })
}, { additionalProperties: false });
var RunToolParams = Type.Object({
  agent: Type.String({ description: "Subagent name" }),
  task: Type.String({ description: "Full task text for the subagent" }),
  main: Type.Optional(Type.Boolean({ description: "Include summarized main-session context" })),
  cwd: Type.Optional(Type.String({ description: "Optional working directory override" }))
}, { additionalProperties: false });
var BatchToolParams = Type.Object({
  items: Type.Array(AgentTaskItem, { description: "Parallel subagent tasks" }),
  main: Type.Optional(Type.Boolean({ description: "Include summarized main-session context" }))
}, { additionalProperties: false });
var ChainToolParams = Type.Object({
  steps: Type.Array(AgentTaskItem, { description: "Sequential subagent steps" }),
  main: Type.Optional(Type.Boolean({ description: "Include summarized main-session context" }))
}, { additionalProperties: false });
var ContinueToolParams = Type.Object({
  id: Type.Number({ description: "Run ID to continue" }),
  task: Type.String({ description: "Follow-up message for the existing run" })
}, { additionalProperties: false });
var buildIdParams = (description) => Type.Object({
  id: Type.Number({ description })
}, { additionalProperties: false });
var AbortToolParams = buildIdParams("Run ID to abort");
var DetailToolParams = buildIdParams("Run ID to inspect");
var RunsToolParams = Type.Object({}, { additionalProperties: false });

// src/tool-specs.ts
var str = (value, key) => String(Reflect.get(Object(value), key) ?? "");
var num = (value, key) => Number(Reflect.get(Object(value), key));
var bool = (value, key) => Boolean(Reflect.get(Object(value), key));
var tasks = (value, key) => {
  const list = Reflect.get(Object(value), key);
  return Array.isArray(list) ? list.map((item) => ({ agent: str(item, "agent"), task: str(item, "task") })) : [];
};
var subagentToolSpecs = [
  { name: subagentToolName("run"), label: "Subagent Run", description: "Run a single isolated subagent", parameters: RunToolParams, buildSubcommand: (params) => ({ type: "run", agent: str(params, "agent"), task: str(params, "task"), main: bool(params, "main"), cwd: str(params, "cwd") || void 0 }) },
  { name: subagentToolName("batch"), label: "Subagent Batch", description: "Run multiple isolated subagents in parallel", parameters: BatchToolParams, buildSubcommand: (params) => ({ type: "batch", items: tasks(params, "items"), main: bool(params, "main") }) },
  { name: subagentToolName("chain"), label: "Subagent Chain", description: "Run isolated subagents sequentially with previous output piping", parameters: ChainToolParams, buildSubcommand: (params) => ({ type: "chain", steps: tasks(params, "steps"), main: bool(params, "main") }) },
  { name: subagentToolName("continue"), label: "Subagent Continue", description: "Continue an existing subagent session", parameters: ContinueToolParams, buildSubcommand: (params) => ({ type: "continue", id: num(params, "id"), task: str(params, "task") }) },
  { name: subagentToolName("abort"), label: "Subagent Abort", description: "Abort an active subagent run", parameters: AbortToolParams, buildSubcommand: (params) => ({ type: "abort", id: num(params, "id") }) },
  { name: subagentToolName("detail"), label: "Subagent Detail", description: "Show detailed history for a subagent run", parameters: DetailToolParams, buildSubcommand: (params) => ({ type: "detail", id: num(params, "id") }) },
  { name: subagentToolName("runs"), label: "Subagent Runs", description: "List active and historical subagent runs", parameters: RunsToolParams, buildSubcommand: () => ({ type: "runs" }) }
];

// src/tool.ts
var result = (text, isError = false, details) => ({ content: [{ type: "text", text }], details: { isError, ...details } });
var errorMsg2 = (error) => error instanceof Error ? error.message : String(error);
async function dispatch(cmd, agents, ctx, onUpdate, signal) {
  if (cmd.type === "runs") return result(formatRunsList());
  if (cmd.type === "detail") return result(formatDetail(cmd.id));
  if (cmd.type === "abort") return result(dispatchAbort(cmd.id));
  if (cmd.type === "run") return runSingle(cmd, agents, ctx, onUpdate, signal);
  if (cmd.type === "batch") return runMany(cmd, agents, ctx, onUpdate, signal);
  if (cmd.type === "chain") return runChain(cmd, agents, ctx, onUpdate, signal);
  const continued = await dispatchContinue(cmd.id, cmd.task, agents, ctx, onUpdate, signal);
  return typeof continued === "string" ? result(continued, continued.includes("not found")) : result(buildResultText(continued), !!continued.error, { runTrees: [resultToRunTree(continued)] });
}
async function runSingle(cmd, agents, ctx, onUpdate, signal) {
  const agent = getAgent(cmd.agent, agents);
  if (!agent) return result(`Unknown agent: ${cmd.agent}`, true);
  const output = await dispatchRun(agent, cmd.task, ctx, cmd.main, onUpdate, signal);
  return result(buildResultText(output), !!output.error, { runTrees: [resultToRunTree(output)] });
}
async function runMany(cmd, agents, ctx, onUpdate, signal) {
  const output = await dispatchBatch(cmd.items, agents, ctx, cmd.main, onUpdate, signal);
  return result(output.map(buildResultText).join("\n---\n"), output.some((item) => !!item.error), { runTrees: output.map(resultToRunTree) });
}
async function runChain(cmd, agents, ctx, onUpdate, signal) {
  const output = await dispatchChain(cmd.steps, agents, ctx, cmd.main, onUpdate, signal);
  return result(buildResultText(output), !!output.error, { runTrees: [resultToRunTree(output)] });
}
var snippet = (agents) => `Dispatch subagents: ${agents.map((agent) => `${agent.name} (${agent.description})`).join(", ") || "none loaded"}`;
var guidelines = (agents) => ["Available agents:", ...agents.map((agent) => `  - ${agent.name}: ${agent.description}`), "Use subagent_run / subagent_batch / subagent_chain / subagent_continue / subagent_abort / subagent_detail / subagent_runs as appropriate."];
function createNamedTool(spec, pi, agentsDir) {
  const agents = existsSync2(agentsDir) ? loadAgentsFromDir(agentsDir, (dir) => readdirSync(dir).map(String), readFileSync) : [];
  return defineTool({
    name: spec.name,
    label: spec.label,
    description: spec.description,
    parameters: spec.parameters,
    promptSnippet: snippet(agents),
    promptGuidelines: guidelines(agents),
    async execute(_id, params, signal, onUpdate, ctx) {
      try {
        return await dispatch(spec.buildSubcommand(params), agents, ctx, onUpdate, signal);
      } catch (error) {
        return result(`Error: ${errorMsg2(error)}`, true);
      }
    },
    renderCall: (args) => renderCallForCommand(spec.buildSubcommand(args)),
    renderResult: (res) => renderResult(res)
  });
}
var createRunTool = (pi, agentsDir) => createNamedTool(subagentToolSpecs[0], pi, agentsDir);
var createBatchTool = (pi, agentsDir) => createNamedTool(subagentToolSpecs[1], pi, agentsDir);
var createChainTool = (pi, agentsDir) => createNamedTool(subagentToolSpecs[2], pi, agentsDir);
var createContinueTool = (pi, agentsDir) => createNamedTool(subagentToolSpecs[3], pi, agentsDir);
var createAbortTool = (pi, agentsDir) => createNamedTool(subagentToolSpecs[4], pi, agentsDir);
var createDetailTool = (pi, agentsDir) => createNamedTool(subagentToolSpecs[5], pi, agentsDir);
var createRunsTool = (pi, agentsDir) => createNamedTool(subagentToolSpecs[6], pi, agentsDir);

// src/commands.ts
import { existsSync as existsSync3, readdirSync as readdirSync2, readFileSync as readFileSync2 } from "fs";
function buildHelpText(agentsDir) {
  const agents = existsSync3(agentsDir) ? loadAgentsFromDir(agentsDir, (dir) => readdirSync2(dir).map(String), readFileSync2) : [];
  return [
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
    ...agents.map((agent) => `  ${agent.name.padEnd(18)} ${agent.description}`)
  ].join("\n");
}
function buildInvocationMessage(args) {
  const call = subcommandToToolCall(parseCommand(args));
  return [`Call the ${call.toolName} tool immediately with these exact parameters.`, "Do not rewrite, summarize, or re-quote any task text.", JSON.stringify(call.input, null, 2)].join("\n\n");
}
function buildSubCommand(agentsDir, sendUserMessage) {
  return {
    description: "\uC11C\uBE0C\uC5D0\uC774\uC804\uD2B8 \uBA85\uB839 (run, batch, chain, continue, abort, detail, runs)",
    handler: async (args, ctx) => {
      if (!args.trim()) return void ctx.ui.notify(buildHelpText(agentsDir), "info");
      try {
        sendUserMessage(buildInvocationMessage(args), { deliverAs: "steer" });
      } catch (error) {
        ctx.ui.notify(error instanceof Error ? error.message : String(error), "error");
      }
    }
  };
}

// src/index.ts
import { dirname as dirname2, join as join4 } from "path";
import { fileURLToPath } from "url";
function index_default(pi) {
  pi.on("session_start", onSessionRestore());
  pi.on("session_tree", onSessionRestore());
  pi.on("agent_end", async (_event, ctx) => {
    pi.appendEntry("subagent-runs", buildRunsEntry());
    syncWidget(ctx, listRuns());
  });
  pi.registerTool(createRunTool(pi, join4(dirname2(fileURLToPath(import.meta.url)), "..", "agents")));
  pi.registerTool(createBatchTool(pi, join4(dirname2(fileURLToPath(import.meta.url)), "..", "agents")));
  pi.registerTool(createChainTool(pi, join4(dirname2(fileURLToPath(import.meta.url)), "..", "agents")));
  pi.registerTool(createContinueTool(pi, join4(dirname2(fileURLToPath(import.meta.url)), "..", "agents")));
  pi.registerTool(createAbortTool(pi, join4(dirname2(fileURLToPath(import.meta.url)), "..", "agents")));
  pi.registerTool(createDetailTool(pi, join4(dirname2(fileURLToPath(import.meta.url)), "..", "agents")));
  pi.registerTool(createRunsTool(pi, join4(dirname2(fileURLToPath(import.meta.url)), "..", "agents")));
  pi.registerCommand("sub", buildSubCommand(join4(dirname2(fileURLToPath(import.meta.url)), "..", "agents"), (c, o) => pi.sendUserMessage(c, o)));
}
export {
  index_default as default
};
