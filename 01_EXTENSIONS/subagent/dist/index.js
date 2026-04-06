// src/types.ts
import { Type } from "@sinclair/typebox";
var SubagentParams = Type.Object({
  command: Type.String({ description: "Subcommand string (e.g. 'run scout -- find auth code')" })
});

// src/cli.ts
function parseArgs(input) {
  const result = { _: [] };
  const tokens = input.match(/(?:[^\s"]+|"[^"]*")+/g) ?? [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.startsWith("--")) {
      const key = t.slice(2);
      const next = tokens[i + 1];
      if (!next || next.startsWith("--")) {
        result[key] = true;
        continue;
      }
      i++;
      const val = next.replace(/^"|"$/g, "");
      const prev = result[key];
      if (Array.isArray(prev)) {
        prev.push(val);
      } else if (prev !== void 0 && prev !== true) {
        result[key] = [prev, val];
      } else {
        result[key] = val;
      }
    } else {
      result._.push(t.replace(/^"|"$/g, ""));
    }
  }
  return result;
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
var pendingResults = [];
function sessionPath(id, home) {
  return join(home ?? homedir(), ".pi", "agent", "sessions", "subagents", `run-${id}.json`);
}
function addToHistory(item) {
  history.push(item);
}
function getRunHistory() {
  return [...history];
}
function addPending(result) {
  pendingResults.push(result);
}
function drainPending() {
  return pendingResults.splice(0);
}
function buildRunsEntry() {
  return { runs: [...history], pending: [...pendingResults], updatedAt: Date.now() };
}
function restoreRuns(entries) {
  const relevant = entries.filter(
    (e) => e.type === "custom" && "customType" in e && e.customType === "subagent-runs"
  );
  const last = relevant.at(-1);
  if (!last?.data || typeof last.data !== "object") {
    history = [];
    pendingResults = [];
    return;
  }
  const data = last.data;
  history = "runs" in data && Array.isArray(data.runs) ? [...data.runs] : [];
  pendingResults = "pending" in data && Array.isArray(data.pending) ? [...data.pending] : [];
}
function getSessionFile(id) {
  return history.find((r) => r.id === id)?.sessionFile;
}

// src/constants.ts
var MAX_CONCURRENCY = 8;
var MAX_RETRIES = 3;
var RETRY_BASE_MS = 2e3;
var ESCALATION_MARKER = "[ESCALATION]";
var PIPELINE_MAX_CHARS = 4e3;

// src/execute.ts
function errorResult(agent, msg) {
  return { id: 0, agent, output: "", usage: { inputTokens: 0, outputTokens: 0, turns: 0 }, error: msg };
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
      results.push(errorResult(item.agent, `Unknown agent: ${item.agent}`));
      continue;
    }
    const p = opts.runner(agent, item.task).then((r) => {
      results.push(r);
    }).catch((e) => {
      results.push(errorResult(item.agent, e.message));
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
    if (!agent) return errorResult(step.agent, `Unknown agent: ${step.agent}`);
    const task = step.task.replace("{previous}", previous.slice(0, PIPELINE_MAX_CHARS));
    lastResult = await opts.runner(agent, task);
    if (lastResult.escalation) return lastResult;
    if (lastResult.error) return lastResult;
    previous = lastResult.output;
  }
  return lastResult;
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

// src/render.ts
function buildResultText(result) {
  const header = `${result.agent} #${result.id}`;
  if (result.error) return `\u2717 ${header} error: ${result.error}`;
  if (result.escalation) return `\u26A0 ${header} needs your input:
${result.escalation}

Use: subagent continue ${result.id} -- <your answer>`;
  return `\u2713 ${header}
${result.output}

${formatUsage(result.usage)}`;
}

// src/widget.ts
var MAX_VISIBLE = 3;
var currentTools = /* @__PURE__ */ new Map();
function setCurrentTool(runId, toolName) {
  if (toolName) currentTools.set(runId, toolName);
  else currentTools.delete(runId);
}
function buildWidgetLines(runs, now) {
  return runs.slice(0, MAX_VISIBLE).map((r) => {
    const elapsed = formatDuration(now - r.startedAt);
    const tool = currentTools.get(r.id);
    const suffix = tool ? ` \u2192 ${tool}` : "";
    return `\u27F3 ${r.agent} #${r.id} (${elapsed})${suffix}`;
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
function clearToolState(runId) {
  currentTools.delete(runId);
}

// src/run-factory.ts
import { writeFileSync, existsSync, mkdirSync } from "fs";
import { tmpdir } from "os";
import { join as join2, dirname } from "path";

// src/runner.ts
function getPiCommand(execPath, argv1, exists) {
  if (argv1 && exists(argv1)) return { cmd: execPath, base: [argv1] };
  return { cmd: "pi", base: [] };
}
function buildArgs(input) {
  const args = [...input.base, "--mode", "json", "-p"];
  if (input.sessionPath) {
    args.push("--session", input.sessionPath);
  } else {
    args.push("--no-session");
  }
  if (input.model) {
    args.push("--model", input.model);
  }
  if (input.thinking) {
    args.push("--thinking", input.thinking);
  }
  if (input.tools) {
    args.push("--tools", input.tools.join(","));
  }
  args.push("--append-system-prompt", input.systemPromptPath);
  args.push(`Task: ${input.task}`);
  return args;
}
function collectOutput(events) {
  const texts = [];
  const usage = { inputTokens: 0, outputTokens: 0, turns: 0 };
  for (const evt of events) {
    if (evt.type === "message" && evt.text) {
      texts.push(evt.text);
      usage.inputTokens += evt.usage?.inputTokens ?? 0;
      usage.outputTokens += evt.usage?.outputTokens ?? 0;
      usage.turns += evt.usage?.turns ?? 0;
    }
  }
  const output = texts.join("\n");
  const escalation = output.includes(ESCALATION_MARKER) ? output.split(ESCALATION_MARKER)[1]?.trim() : void 0;
  return { output, usage, escalation };
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

// src/spawn.ts
import { spawn } from "child_process";
import { createInterface } from "readline";

// src/parser.ts
function parseLine(line) {
  if (!line.trim()) return null;
  try {
    const evt = JSON.parse(line);
    switch (evt.type) {
      case "message_end":
        return parseMessageEnd(evt);
      case "tool_execution_start":
        return { type: "tool_start", toolName: evt.toolName };
      case "tool_execution_end":
        return { type: "tool_end", toolName: evt.toolName };
      case "agent_end":
        return { type: "agent_end" };
      default:
        return null;
    }
  } catch {
    return null;
  }
}
function parseMessageEnd(evt) {
  const msg = evt.message;
  if (!msg || msg.role !== "assistant") return null;
  const text = msg.content?.filter((c) => c.type === "text").map((c) => c.text).join("\n") ?? "";
  const usage = msg.usage ? { inputTokens: msg.usage.inputTokens ?? 0, outputTokens: msg.usage.outputTokens ?? 0, turns: 1 } : void 0;
  return { type: "message", text, usage };
}

// src/spawn.ts
function spawnAndCollect(cmd, args, id, agentName, signal, onEvent) {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    if (signal) {
      signal.addEventListener("abort", () => {
        proc.kill();
        reject(new Error("Aborted"));
      });
    }
    const events = [];
    const stderrChunks = [];
    const rl = createInterface({ input: proc.stdout });
    rl.on("line", (line) => {
      const evt = parseLine(line);
      if (evt) {
        events.push(evt);
        onEvent?.(evt);
      }
    });
    proc.stderr.on("data", (chunk) => {
      stderrChunks.push(chunk.toString());
    });
    proc.on("error", (err) => reject(err));
    proc.on("close", (code) => {
      const { output, usage, escalation } = collectOutput(events);
      if (code !== 0 && !output) {
        const stderr = stderrChunks.join("").trim();
        reject(new Error(stderr || `Process exited with code ${code}`));
        return;
      }
      resolve({ id, agent: agentName, output, usage, escalation });
    });
  });
}

// src/run-factory.ts
function makeOnEvent(id, ctx, collected) {
  return (evt) => {
    collected.push({ type: evt.type, text: evt.text, toolName: evt.toolName });
    if (evt.type === "tool_start") {
      setCurrentTool(id, evt.toolName);
      syncWidget(ctx, listRuns());
    }
    if (evt.type === "tool_end") {
      setCurrentTool(id, void 0);
      syncWidget(ctx, listRuns());
    }
  };
}
function createRunner(main, ctx) {
  return async (agent, task) => {
    const id = nextId();
    const promptPath = join2(tmpdir(), `pi-sub-${agent.name}-${id}.md`);
    let prompt = agent.systemPrompt;
    if (main) {
      const branch = ctx.sessionManager.getBranch();
      const mainCtx = extractMainContext(branch, 20);
      if (mainCtx) prompt += `

[Main Context]
${mainCtx}`;
    }
    writeFileSync(promptPath, prompt);
    const { cmd, base } = getPiCommand(process.execPath, process.argv[1], existsSync);
    const sessPath = sessionPath(id);
    const dir = dirname(sessPath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const args = buildArgs({ base, model: agent.model, thinking: agent.thinking, tools: agent.tools, systemPromptPath: promptPath, task, sessionPath: sessPath });
    const ac = new AbortController();
    addRun({ id, agent: agent.name, startedAt: Date.now(), abort: () => ac.abort() });
    const collected = [];
    const onEvent = makeOnEvent(id, ctx, collected);
    try {
      const result = await withRetry(() => spawnAndCollect(cmd, args, id, agent.name, ac.signal, onEvent), MAX_RETRIES, RETRY_BASE_MS);
      addToHistory({ id, agent: agent.name, output: result.output, sessionFile: sessPath, events: collected });
      return result;
    } finally {
      clearToolState(id);
      removeRun(id);
    }
  };
}
function createSessionRunner(sessFile, ctx) {
  return async (agent, task) => {
    const id = nextId();
    const { cmd, base } = getPiCommand(process.execPath, process.argv[1], existsSync);
    const args = buildArgs({ base, model: agent.model, thinking: agent.thinking, tools: agent.tools, systemPromptPath: "", task, sessionPath: sessFile });
    const idx = args.indexOf("--append-system-prompt");
    if (idx !== -1) args.splice(idx, 2);
    const ac = new AbortController();
    addRun({ id, agent: agent.name, startedAt: Date.now(), abort: () => ac.abort() });
    const collected = [];
    const onEvent = makeOnEvent(id, ctx, collected);
    try {
      const result = await withRetry(() => spawnAndCollect(cmd, args, id, agent.name, ac.signal, onEvent), MAX_RETRIES, RETRY_BASE_MS);
      addToHistory({ id, agent: agent.name, output: result.output, sessionFile: sessFile, events: collected });
      return result;
    } finally {
      clearToolState(id);
      removeRun(id);
    }
  };
}

// src/dispatch.ts
function sendFollowUp(pi, result, customType = "subagent-result") {
  try {
    pi.sendMessage(
      { customType, content: buildResultText(result), display: true },
      { deliverAs: "followUp", triggerTurn: true }
    );
  } catch {
    addPending(result);
  }
}
function errorResult2(agent, e) {
  return { id: 0, agent, output: "", error: e.message, usage: { inputTokens: 0, outputTokens: 0, turns: 0 } };
}
function dispatchRun(agent, task, pi, ctx, main) {
  const runner = createRunner(main, ctx);
  executeSingle(agent, task, { runner }).then((r) => sendFollowUp(pi, r)).catch((e) => sendFollowUp(pi, errorResult2(agent.name, e))).finally(() => syncWidget(ctx, listRuns()));
  syncWidget(ctx, listRuns());
  return { text: `${agent.name} started` };
}
function dispatchBatch(items, agents, pi, ctx, main) {
  const runner = createRunner(main, ctx);
  executeBatch(items, agents, { runner }).then((results) => {
    const text = results.map((r) => buildResultText(r)).join("\n---\n");
    pi.sendMessage({ customType: "subagent-batch", content: text, display: true }, { deliverAs: "followUp", triggerTurn: true });
  }).finally(() => syncWidget(ctx, listRuns()));
  syncWidget(ctx, listRuns());
  return `batch started (${items.length} tasks)`;
}
function dispatchChain(steps, agents, pi, ctx, main) {
  const runner = createRunner(main, ctx);
  executeChain(steps, agents, { runner }).then((r) => sendFollowUp(pi, r)).finally(() => syncWidget(ctx, listRuns()));
  syncWidget(ctx, listRuns());
  return `chain started (${steps.length} steps)`;
}
function dispatchAbort(id) {
  const run = getRun(id);
  if (!run) return `Run #${id} not found`;
  run.abort();
  removeRun(id);
  return `Run #${id} (${run.agent}) aborted`;
}
function dispatchContinue(id, task, agents, pi, ctx) {
  const hist = getRunHistory().find((r) => r.id === id);
  if (!hist) return `Run #${id} not found in history`;
  const sessFile = getSessionFile(id);
  if (!sessFile) return `Run #${id} not found in history`;
  const agent = getAgent(hist.agent, agents);
  if (!agent) return `Agent for run #${id} not found`;
  const runner = createSessionRunner(sessFile, ctx);
  executeSingle(agent, task, { runner }).then((r) => sendFollowUp(pi, r)).catch((e) => sendFollowUp(pi, errorResult2(agent.name, e))).finally(() => syncWidget(ctx, listRuns()));
  return `continue #${id} (${agent.name}) started`;
}
function onSessionRestore(pi) {
  return async (_e, ctx) => {
    restoreRuns(ctx.sessionManager.getBranch());
    syncWidget(ctx, listRuns());
    for (const r of drainPending()) {
      pi.sendMessage({ customType: "subagent-pending", content: buildResultText(r), display: true }, { deliverAs: "followUp", triggerTurn: true });
    }
  };
}

// src/tool.ts
import { readdirSync, readFileSync, existsSync as existsSync2 } from "fs";
function textResult(text, isError = false) {
  return { content: [{ type: "text", text }], details: { isError } };
}
function errorMsg(e) {
  return e instanceof Error ? e.message : String(e);
}
function formatRunsList() {
  const active2 = listRuns();
  const history2 = getRunHistory();
  const parts = [];
  if (active2.length) parts.push(`Active (${active2.length}):
` + active2.map((r) => `  #${r.id} ${r.agent}`).join("\n"));
  if (history2.length) parts.push(`History (${history2.length}):
` + history2.map((r) => `  #${r.id} ${r.agent}`).join("\n"));
  return parts.join("\n\n") || "No runs";
}
function formatDetail(id) {
  const item = getRunHistory().find((r) => r.id === id);
  if (!item) return `Run #${id} not found`;
  const parts = [`# ${item.agent} #${id}`];
  if (item.events?.length) {
    for (const evt of item.events) {
      if (evt.type === "tool_start") parts.push(`  \u2192 ${evt.toolName}`);
      if (evt.type === "message" && evt.text) parts.push(`  ${evt.text}`);
    }
  } else {
    parts.push(item.output ?? "(no output)");
  }
  return parts.join("\n");
}
function dispatch(cmd, agents, pi, ctx) {
  if (cmd.type === "runs") return textResult(formatRunsList());
  if (cmd.type === "detail") return textResult(formatDetail(cmd.id));
  if (cmd.type === "run") {
    const agent = getAgent(cmd.agent, agents);
    if (!agent) return textResult(`Unknown agent: ${cmd.agent}`);
    const { text } = dispatchRun(agent, cmd.task, pi, ctx, cmd.main);
    return textResult(text);
  }
  if (cmd.type === "batch") return textResult(dispatchBatch(cmd.items, agents, pi, ctx, cmd.main));
  if (cmd.type === "chain") return textResult(dispatchChain(cmd.steps, agents, pi, ctx, cmd.main));
  if (cmd.type === "abort") return textResult(dispatchAbort(cmd.id));
  return textResult(dispatchContinue(cmd.id, cmd.task, agents, pi, ctx));
}
function buildSnippet(agents) {
  const names = agents.map((a) => `${a.name} (${a.description})`).join(", ");
  return `Dispatch subagents: ${names || "none loaded"}`;
}
function buildGuidelines(agents) {
  const list = agents.map((a) => `  - ${a.name}: ${a.description}`);
  return [
    "Available agents:",
    ...list,
    "Command format: run <agent> [--main] -- <task>",
    "Batch: batch --agent <a> --task <t> [--agent <a> --task <t> ...]",
    "Chain: chain --agent <a> --task <t> --agent <a> --task '{previous}'",
    "Management: continue <id> -- <task>, abort <id>, detail <id>, runs",
    "Use --main to inject current conversation context into the subagent"
  ];
}
function createTool(pi, agentsDir) {
  const agents = existsSync2(agentsDir) ? loadAgentsFromDir(agentsDir, (d) => readdirSync(d).map(String), readFileSync) : [];
  return {
    name: "subagent",
    label: "Subagent",
    description: "Run isolated subagent processes in separate pi subprocesses with their own context window",
    promptSnippet: buildSnippet(agents),
    promptGuidelines: buildGuidelines(agents),
    parameters: SubagentParams,
    async execute(_id, params, _signal, _onUpdate, ctx) {
      try {
        return dispatch(parseCommand(params.command), agents, pi, ctx);
      } catch (e) {
        return textResult(`Error: ${errorMsg(e)}`, true);
      }
    }
  };
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
function buildSubCommand(agentsDir) {
  return {
    description: "\uC11C\uBE0C\uC5D0\uC774\uC804\uD2B8 \uBA85\uB839 (run, batch, chain, continue, abort, detail, runs)",
    handler: async (_args, ctx) => {
      ctx.ui.notify(buildHelpText(agentsDir), "info");
    }
  };
}

// src/index.ts
import { dirname as dirname2, join as join3 } from "path";
import { fileURLToPath } from "url";
function index_default(pi) {
  pi.on("session_start", onSessionRestore(pi));
  pi.on("session_tree", onSessionRestore(pi));
  pi.on("agent_end", async (_event, ctx) => {
    pi.appendEntry("subagent-runs", buildRunsEntry());
    syncWidget(ctx, listRuns());
  });
  pi.registerTool(createTool(pi, join3(dirname2(fileURLToPath(import.meta.url)), "..", "agents")));
  pi.registerCommand("sub", buildSubCommand(join3(dirname2(fileURLToPath(import.meta.url)), "..", "agents")));
}
export {
  index_default as default
};
