// src/tool.ts
import { Type } from "@sinclair/typebox";

// src/time-utils.ts
function formatKoreanDuration(ms) {
  if (ms < 6e4) return `${Math.max(1, Math.round(ms / 1e3))}\uCD08`;
  if (ms < 36e5) return `${Math.max(1, Math.round(ms / 6e4))}\uBD84`;
  const hours = Math.floor(ms / 36e5);
  const minutes = Math.floor(ms % 36e5 / 6e4);
  if (minutes === 0) return `${hours}\uC2DC\uAC04`;
  return `${hours}\uC2DC\uAC04 ${minutes}\uBD84`;
}
function formatClock(ts) {
  return new Date(ts).toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  });
}

// src/constants.ts
var CUSTOM_TYPE = "until";
var STATUS_KEY = "until-footer";
var MAX_TASKS = 3;
var MIN_INTERVAL_MS = 6e4;
var MAX_EXPIRY_MS = 24 * 60 * 60 * 1e3;
var JITTER_RATIO = 0.1;

// src/state.ts
var tasks = /* @__PURE__ */ new Map();
var nextTaskId = 1;
var agentRunning = false;
var sendMsg;
var sendUserMsg;
var ui;
function initApi(s, u) {
  sendMsg = s;
  sendUserMsg = u;
}
function sendMessage(...args) {
  sendMsg?.(...args);
}
function sendUserMessage(...args) {
  sendUserMsg?.(...args);
}
function setUi(handle) {
  ui = handle;
}
function setAgentRunning(val) {
  agentRunning = val;
}
function isAgentRunning() {
  return agentRunning;
}
function getTasks() {
  return tasks;
}
function getTask(id) {
  return tasks.get(id);
}
function allocateId() {
  return nextTaskId++;
}
function addTask(task) {
  tasks.set(task.id, task);
}
function deleteTask(id) {
  const task = tasks.get(id);
  if (task) clearTimeout(task.timer);
  tasks.delete(id);
  updateFooter();
}
function clearAllTasks() {
  for (const t of tasks.values()) clearTimeout(t.timer);
  tasks.clear();
  updateFooter();
}
function updateFooter() {
  if (!ui) return;
  if (tasks.size === 0) {
    ui.setStatus(STATUS_KEY, void 0);
    return;
  }
  let nearest = Number.POSITIVE_INFINITY;
  for (const t of tasks.values()) {
    if (t.nextRunAt < nearest) nearest = t.nextRunAt;
  }
  const next = nearest < Number.POSITIVE_INFINITY ? formatClock(nearest) : "\u2014";
  const text = ui.theme.fg("accent", `\u23F3 until \xD7${tasks.size}`) + ui.theme.fg("dim", ` | next ${next}`);
  ui.setStatus(STATUS_KEY, text);
}

// src/tool.ts
function createReportTool(sendMsg2, sendUserMsg2) {
  initApi(sendMsg2, sendUserMsg2);
  return {
    name: "until_report",
    label: "Until Report",
    description: "until \uBC18\uBCF5 \uC791\uC5C5\uC758 \uACB0\uACFC\uB97C \uBCF4\uACE0\uD569\uB2C8\uB2E4. \uC870\uAC74 \uCDA9\uC871 \uC2DC done: true\uB85C \uBC18\uBCF5\uC744 \uC885\uB8CC\uD569\uB2C8\uB2E4.",
    promptSnippet: "Report until-loop result: done (condition met?) + summary",
    promptGuidelines: ["until \uBC18\uBCF5 \uC791\uC5C5 \uD504\uB86C\uD504\uD2B8\uB97C \uBC1B\uC73C\uBA74, \uC791\uC5C5 \uC218\uD589 \uD6C4 \uBC18\uB4DC\uC2DC until_report\uB97C \uD638\uCD9C\uD558\uC138\uC694."],
    parameters: Type.Object({
      taskId: Type.Number({ description: "until task ID (\uD504\uB86C\uD504\uD2B8\uC758 #N)" }),
      done: Type.Boolean({ description: "\uC870\uAC74\uC774 \uCDA9\uC871\uB418\uC5C8\uC73C\uBA74 true, \uC544\uB2C8\uBA74 false" }),
      summary: Type.String({ description: "\uD604\uC7AC \uC0C1\uD0DC\uB97C \uD55C \uC904\uB85C \uC694\uC57D" })
    }),
    execute: (_toolCallId, params) => {
      return Promise.resolve(handleReport(params));
    }
  };
}
function handleReport(params) {
  const task = getTask(params.taskId);
  if (!task) throw new Error(`until #${params.taskId} \uC791\uC5C5\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4. \uC774\uBBF8 \uC644\uB8CC/\uCDE8\uC18C/\uB9CC\uB8CC\uB418\uC5C8\uC744 \uC218 \uC788\uC2B5\uB2C8\uB2E4.`);
  task.inFlight = false;
  task.lastSummary = params.summary;
  if (params.done) {
    const elapsed = formatKoreanDuration(Date.now() - task.createdAt);
    const details = { done: true, summary: params.summary, taskId: task.id, runCount: task.runCount, elapsed };
    deleteTask(task.id);
    return { content: [{ type: "text", text: `until #${task.id} \uC870\uAC74 \uCDA9\uC871\uC73C\uB85C \uC885\uB8CC\uB428. ${params.summary}` }], details };
  }
  return {
    content: [{ type: "text", text: `until #${task.id} \uACC4\uC18D \uBC18\uBCF5. \uB2E4\uC74C \uC2E4\uD589: ${formatClock(task.nextRunAt)}. ${params.summary}` }],
    details: { done: false, summary: params.summary, taskId: task.id, runCount: task.runCount, nextRunAt: task.nextRunAt }
  };
}

// src/cmd-until.ts
import { existsSync } from "node:fs";
import { dirname, join as join2 } from "node:path";
import { fileURLToPath } from "node:url";

// src/interval.ts
var INTERVAL_RE = /^(\d+(?:\.\d+)?)\s*(?:(m|h|분|시간)(?:마다)?)\s*$/i;
function parseInterval(raw) {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const match = trimmed.match(INTERVAL_RE);
  if (!match) return null;
  const amount = Number(match[1]);
  const unitRaw = match[2].toLowerCase();
  if (!Number.isFinite(amount) || amount <= 0) return null;
  if (unitRaw === "m" || unitRaw === "\uBD84") {
    return { ms: amount * 60 * 1e3, label: `${amount}\uBD84` };
  }
  return { ms: amount * 60 * 60 * 1e3, label: `${amount}\uC2DC\uAC04` };
}

// src/presets.ts
import { readdir } from "node:fs/promises";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

// src/frontmatter.ts
function parseFrontmatter(content) {
  const cleaned = content.replace(/^\uFEFF/, "");
  const match = cleaned.match(
    /^---\r?\n([\s\S]*?)\r?\n---\s*(?:\r?\n([\s\S]*))?$/
  );
  if (!match) return { meta: {}, body: cleaned.trim() };
  const meta = {};
  for (const line of match[1].split("\n")) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    if (key && value) meta[key] = value;
  }
  return { meta, body: (match[2] ?? "").trim() };
}

// src/presets.ts
function tryLoadPreset(dir, file) {
  let raw;
  try {
    raw = readFileSync(join(dir, file), "utf-8");
  } catch {
    raw = null;
  }
  if (!raw) return null;
  const { meta, body } = parseFrontmatter(raw);
  if (!body) return null;
  const interval = parseInterval(meta.interval ?? "5m");
  if (!interval) return null;
  const key = file.slice(0, -3).toUpperCase();
  return [
    key,
    {
      defaultInterval: interval,
      description: meta.description ?? key,
      prompt: body
    }
  ];
}
async function loadPresets(dir) {
  const presets = {};
  let files;
  try {
    files = await readdir(dir);
  } catch {
    return presets;
  }
  for (const file of files) {
    if (!file.endsWith(".md")) continue;
    const result = tryLoadPreset(dir, file);
    if (result) presets[result[0]] = result[1];
  }
  return presets;
}
function getPresetCompletions(dir, prefix) {
  let files;
  try {
    files = readdirSync(dir);
  } catch {
    return null;
  }
  const upper = prefix.toUpperCase();
  const items = [];
  for (const f of files) {
    if (!f.endsWith(".md")) continue;
    const result = tryLoadPreset(dir, f);
    if (!result) continue;
    const [key, preset] = result;
    if (!key.startsWith(upper)) continue;
    items.push({
      value: key,
      label: `${key} \u2014 ${preset.description} (${preset.defaultInterval.label})`
    });
  }
  return items.length > 0 ? items : null;
}

// src/runner.ts
function jitter(ms) {
  const offset = ms * JITTER_RATIO * (Math.random() * 2 - 1);
  return Math.max(MIN_INTERVAL_MS, Math.round(ms + offset));
}
function scheduleNext(id) {
  const task = getTask(id);
  if (!task) return;
  clearTimeout(task.timer);
  const delay = jitter(task.intervalMs);
  task.nextRunAt = Date.now() + delay;
  task.timer = setTimeout(() => executeRun(id), delay);
  updateFooter();
}
function buildPrompt(task, elapsed) {
  return [
    `[until #${task.id} \u2014 \uC2E4\uD589 ${task.runCount}\uD68C\uCC28, \uACBD\uACFC ${elapsed}, \uAC04\uACA9 ${task.intervalLabel}]`,
    "",
    task.prompt,
    "",
    "\uC791\uC5C5\uC744 \uC218\uD589\uD55C \uB4A4, \uBC18\uB4DC\uC2DC until_report \uB3C4\uAD6C\uB97C \uD638\uCD9C\uD558\uC5EC \uACB0\uACFC\uB97C \uBCF4\uACE0\uD558\uC138\uC694.",
    `- taskId: ${task.id} (\uC774 \uAC12\uC744 \uADF8\uB300\uB85C \uC804\uB2EC)`,
    "- done: true (\uC870\uAC74 \uCDA9\uC871, \uBC18\uBCF5 \uC885\uB8CC) \uB610\uB294 done: false (\uBBF8\uCDA9\uC871, \uACC4\uC18D \uBC18\uBCF5)",
    "- summary: \uD604\uC7AC \uC0C1\uD0DC\uB97C \uD55C \uC904\uB85C \uC694\uC57D"
  ].join("\n");
}
function executeRun(id) {
  const task = getTask(id);
  if (!task) return;
  const now = Date.now();
  if (now >= task.expiresAt) {
    deleteTask(id);
    return;
  }
  if (task.inFlight) {
    scheduleNext(id);
    return;
  }
  task.runCount++;
  const elapsed = formatKoreanDuration(now - task.createdAt);
  const prompt = buildPrompt(task, elapsed);
  task.inFlight = true;
  try {
    if (isAgentRunning()) {
      sendUserMessage(prompt, { deliverAs: "followUp" });
    } else {
      sendUserMessage(prompt);
    }
  } catch {
    task.inFlight = false;
  }
  scheduleNext(id);
}

// src/register.ts
function registerTask(intervalMs, intervalLabel, prompt, notifyFn) {
  if (getTasks().size >= MAX_TASKS) {
    notifyFn(`\uCD5C\uB300 ${MAX_TASKS}\uAC1C\uAE4C\uC9C0\uB9CC \uB4F1\uB85D\uD560 \uC218 \uC788\uC5B4. /until-cancel\uB85C \uC815\uB9AC\uD574\uC918.`, "error");
    return false;
  }
  if (intervalMs < MIN_INTERVAL_MS) {
    notifyFn(`\uCD5C\uC18C \uAC04\uACA9\uC740 1\uBD84\uC774\uC57C. ${formatKoreanDuration(intervalMs)}\uC740 \uB108\uBB34 \uC9E7\uC544.`, "error");
    return false;
  }
  const id = allocateId();
  const now = Date.now();
  const task = {
    id,
    prompt,
    intervalMs,
    intervalLabel,
    createdAt: now,
    expiresAt: now + MAX_EXPIRY_MS,
    nextRunAt: now,
    runCount: 0,
    inFlight: false,
    timer: setTimeout(() => executeRun(id), 0)
  };
  addTask(task);
  notifyFn(`\u23F3 until #${id} \uB4F1\uB85D\uB428 (${intervalLabel}\uB9C8\uB2E4)`, "info");
  updateFooter();
  return true;
}

// src/cmd-until.ts
var PRESETS_DIR = join2(dirname(fileURLToPath(import.meta.url)), "../until-presets");
function createUntilCommand() {
  return {
    description: "\uC870\uAC74 \uCDA9\uC871\uAE4C\uC9C0 \uC8FC\uAE30\uC801 \uC2E4\uD589. \uC0AC\uC6A9\uBC95: /until <\uAC04\uACA9> <\uD504\uB86C\uD504\uD2B8> \uB610\uB294 /until <\uD504\uB9AC\uC14B>",
    getArgumentCompletions: (prefix) => {
      const trimmed = prefix.trimStart();
      if (trimmed.includes(" ")) {
        const spaceIdx = trimmed.indexOf(" ");
        const first = trimmed.slice(0, spaceIdx);
        const rest = trimmed.slice(spaceIdx + 1).trimStart();
        if (!parseInterval(first) || rest.includes(" ")) return null;
        return getPresetCompletions(PRESETS_DIR, rest);
      }
      return getPresetCompletions(PRESETS_DIR, trimmed);
    },
    handler: async (args, ctx) => {
      const raw = args.trim();
      const presets = await loadPresets(PRESETS_DIR);
      const notifyFn = ctx.ui.notify.bind(ctx.ui);
      if (!raw) {
        showHelp(presets, notifyFn);
        return;
      }
      const directPreset = presets[raw.toUpperCase()];
      if (directPreset) {
        registerTask(directPreset.defaultInterval.ms, directPreset.defaultInterval.label, directPreset.prompt, notifyFn);
        return;
      }
      if (!raw.includes(" ") && existsSync(join2(PRESETS_DIR, `${raw.toUpperCase()}.md`))) {
        notifyFn(`\uD504\uB9AC\uC14B "${raw.toUpperCase()}" \uD30C\uC77C\uC740 \uC788\uC9C0\uB9CC \uB85C\uB4DC\uC5D0 \uC2E4\uD328\uD588\uC5B4.
frontmatter\uB97C \uD655\uC778\uD574\uC918.`, "error");
        return;
      }
      const spaceIdx = raw.indexOf(" ");
      if (spaceIdx === -1) {
        notifyFn("\uD504\uB86C\uD504\uD2B8\uAC00 \uD544\uC694\uD574. \uC608: /until 5m PR \uCF54\uBA58\uD2B8 \uD655\uC778\uD574\uC918\n\uD504\uB9AC\uC14B: /until PR", "error");
        return;
      }
      handleIntervalArgs(raw, spaceIdx, presets, notifyFn);
    }
  };
}
function handleIntervalArgs(raw, spaceIdx, presets, notifyFn) {
  const firstToken = raw.slice(0, spaceIdx);
  const rest = raw.slice(spaceIdx + 1).trim();
  const parsed = parseInterval(firstToken);
  if (!parsed) {
    notifyFn(`\uC778\uD130\uBC8C "${firstToken}"\uC744 \uD30C\uC2F1\uD560 \uC218 \uC5C6\uC5B4.
\uC9C0\uC6D0: 5m, 1h, 5\uBD84, 1\uC2DC\uAC04, 5\uBD84\uB9C8\uB2E4`, "error");
    return;
  }
  const restPreset = presets[rest.toUpperCase()];
  if (restPreset) {
    registerTask(parsed.ms, parsed.label, restPreset.prompt, notifyFn);
    return;
  }
  registerTask(parsed.ms, parsed.label, rest, notifyFn);
}
function showHelp(presets, notifyFn) {
  const list = Object.entries(presets).map(([k, p]) => `  ${k} \u2014 ${p.description} (\uAE30\uBCF8 ${p.defaultInterval.label})`).join("\n");
  const help = list ? `

\uD504\uB9AC\uC14B:
${list}
\uC608: /until PR  \uB610\uB294  /until 10m PR` : "";
  notifyFn(`\uC0AC\uC6A9\uBC95: /until <\uAC04\uACA9> <\uD504\uB86C\uD504\uD2B8>
\uC608: /until 5m PR \uCF54\uBA58\uD2B8 \uD655\uC778\uD574\uC918${help}`, "warning");
}

// src/cmd-untils.ts
function createUntilsCommand(_sendMsg) {
  return {
    description: "\uD65C\uC131 until \uBAA9\uB85D \uBCF4\uAE30",
    handler: async (_args, ctx) => {
      const tasks2 = getTasks();
      if (tasks2.size === 0) {
        ctx.ui.notify("\uD65C\uC131 until \uC791\uC5C5\uC774 \uC5C6\uC5B4.", "info");
        return;
      }
      const now = Date.now();
      const lines = [...tasks2.values()].sort((a, b) => a.nextRunAt - b.nextRunAt).map((t) => {
        const remain = formatKoreanDuration(Math.max(0, t.nextRunAt - now));
        const elapsed = formatKoreanDuration(now - t.createdAt);
        const summary = t.lastSummary ? `
     \uCD5C\uADFC: ${t.lastSummary}` : "";
        return `  #${t.id} \xB7 ${t.intervalLabel}\uB9C8\uB2E4 \xB7 \uC2E4\uD589 ${t.runCount}\uD68C \xB7 \uACBD\uACFC ${elapsed} \xB7 \uB2E4\uC74C ${remain} \uD6C4${summary}
     ${t.prompt}`;
      });
      sendMessage({
        customType: CUSTOM_TYPE,
        content: `\uD65C\uC131 until \uBAA9\uB85D (${tasks2.size}\uAC1C)

${lines.join("\n\n")}`,
        display: true
      });
    }
  };
}

// src/cmd-cancel.ts
function createCancelCommand() {
  return {
    description: "until \uCDE8\uC18C. \uC0AC\uC6A9\uBC95: /until-cancel <id|all>",
    handler: async (args, ctx) => {
      const raw = args.trim().toLowerCase();
      if (!raw) {
        ctx.ui.notify("\uC0AC\uC6A9\uBC95: /until-cancel <id|all>", "info");
        return;
      }
      if (raw === "all") {
        const count = getTasks().size;
        clearAllTasks();
        ctx.ui.notify(`until ${count}\uAC1C \uCDE8\uC18C\uB428`, "info");
        return;
      }
      const id = Number(raw);
      if (!Number.isInteger(id)) {
        ctx.ui.notify("id\uB294 \uC22B\uC790\uC5EC\uC57C \uD574. \uC608: /until-cancel 3", "warning");
        return;
      }
      if (!getTask(id)) {
        ctx.ui.notify(`until #${id} \uC5C6\uC74C`, "warning");
        return;
      }
      deleteTask(id);
      ctx.ui.notify(`until #${id} \uCDE8\uC18C\uB428`, "info");
    }
  };
}

// src/handlers.ts
function handleAgentStart(ctx) {
  setAgentRunning(true);
  if (ctx.hasUI) setUi(ctx.ui);
}
function handleAgentEnd(ctx) {
  setAgentRunning(false);
  if (ctx.hasUI) setUi(ctx.ui);
}
function filterContext(event) {
  const filtered = event.messages.filter((m) => {
    if (m.role !== "custom") return true;
    const rec = m;
    return rec.customType !== CUSTOM_TYPE;
  });
  if (filtered.length === event.messages.length) return void 0;
  return { messages: filtered };
}
function handleSessionStart(ctx) {
  clearAllTasks();
  if (ctx.hasUI) setUi(ctx.ui);
}
function handleSessionShutdown() {
  clearAllTasks();
}

// src/index.ts
function index_default(pi) {
  pi.registerTool(createReportTool(pi.sendMessage.bind(pi), pi.sendUserMessage.bind(pi)));
  pi.registerCommand("until", createUntilCommand());
  pi.registerCommand("untils", createUntilsCommand(pi.sendMessage.bind(pi)));
  pi.registerCommand("until-cancel", createCancelCommand());
  pi.on("agent_start", async (_event, ctx) => {
    handleAgentStart(ctx);
  });
  pi.on("agent_end", async (_event, ctx) => {
    handleAgentEnd(ctx);
  });
  pi.on("context", async (event, _ctx) => {
    return filterContext(event);
  });
  pi.on("session_start", async (_event, ctx) => {
    handleSessionStart(ctx);
  });
  pi.on("session_shutdown", async () => {
    handleSessionShutdown();
  });
}
export {
  index_default as default
};
