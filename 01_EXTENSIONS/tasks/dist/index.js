// src/execute-text.ts
var LAUNCH_RE = /^#(\d+)\s+→\s+agent\s+(\S+)$/;
function launchesOf(text) {
  return text.split("\n").flatMap((line) => {
    const match = line.match(LAUNCH_RE);
    return match ? [{ taskId: match[1], agentId: match[2] }] : [];
  });
}
function rememberLaunchedTasks(text, launches) {
  for (const launch of launchesOf(text)) launches.set(launch.agentId, launch.taskId);
}
function rewriteExecuteMessage(text) {
  const launches = launchesOf(text);
  if (launches.length === 0) return text;
  const skipped = text.split("\n\n").find((block) => block.startsWith("Skipped:"));
  const body = launches.map(({ taskId, agentId }) => `- task_id=${taskId} (stable), agent_id=${agentId} (runtime)`).join("\n");
  const lines = [
    `Launched ${launches.length} agent(s):`,
    body,
    "Use TaskOutput with the stable task_id (recommended) or the runtime agent_id above. Both remain valid after completion in this session."
  ];
  if (skipped) lines.push(skipped);
  return lines.join("\n\n");
}

// src/results.ts
function textIndex(result) {
  return result.content?.findIndex((item) => item.type === "text" && typeof item.text === "string") ?? -1;
}
function readTextContent(result) {
  const index = textIndex(result);
  if (index < 0) return "";
  return String(result.content[index].text);
}
function replaceTextContent(result, text) {
  const content = result.content ?? [];
  const index = textIndex(result);
  if (index < 0) return { ...result, content: [...content, { type: "text", text }] };
  return {
    ...result,
    content: content.map((item, itemIndex) => itemIndex === index ? { ...item, text } : item)
  };
}

// src/wrap-execute.ts
var DESCRIPTION = [
  "Execute one or more tasks as subagents.",
  "- The result shows stable task_id values and runtime agent_id values.",
  "- Use TaskOutput with the stable task_id (recommended) or the runtime agent_id."
].join("\n");
function wrapTaskExecute(tool, launchMap) {
  if (typeof tool.execute !== "function") return { ...tool, description: DESCRIPTION };
  return {
    ...tool,
    description: DESCRIPTION,
    execute: async (...args) => {
      const result = await tool.execute(...args);
      const text = readTextContent(result);
      rememberLaunchedTasks(text, launchMap);
      return replaceTextContent(result, rewriteExecuteMessage(text));
    }
  };
}

// src/store-scan.ts
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
function taskScope(cwd) {
  try {
    const path = join(cwd, ".pi", "tasks-config.json");
    return JSON.parse(readFileSync(path, "utf8")).taskScope ?? "session";
  } catch {
    return "session";
  }
}
function resolveTaskStorePath(ctx) {
  const cwd = ctx.cwd ?? process.cwd();
  const override = process.env.PI_TASKS;
  if (override === "off") return;
  if (override?.startsWith("/")) return override;
  if (override?.startsWith(".")) return resolve(cwd, override);
  if (override) return join(homedir(), ".pi", "tasks", `${override}.json`);
  const scope = taskScope(cwd);
  if (scope === "memory") return;
  if (scope === "project") return join(cwd, ".pi", "tasks", "tasks.json");
  const sessionId = ctx.sessionManager?.getSessionId?.();
  return sessionId ? join(cwd, ".pi", "tasks", `tasks-${sessionId}.json`) : void 0;
}
function readTaskSnapshots(ctx) {
  const path = resolveTaskStorePath(ctx);
  if (!path || !existsSync(path)) return [];
  try {
    const data = JSON.parse(readFileSync(path, "utf8"));
    return Array.isArray(data.tasks) ? data.tasks : [];
  } catch {
    return [];
  }
}

// src/task-ref.ts
function matches(value, input) {
  return input.length > 0 && !!value && (value === input || value.startsWith(input));
}
function taskIdsOf(input, launchMap, tasks) {
  const ids = /* @__PURE__ */ new Set();
  for (const [agentId, taskId] of launchMap) if (matches(agentId, input)) ids.add(taskId);
  for (const task of tasks) {
    if (matches(task.metadata?.agentId, input) || matches(task.owner, input)) ids.add(task.id);
  }
  return [...ids];
}
function looksLikeRuntimeId(input) {
  return !/^\d+$/.test(input) && (input.includes("-") || /[a-f\d]{8,}/i.test(input));
}
function missingTaskIdMessage(input) {
  return `No task found for runtime agent ID "${input}". Use the stable task_id from TaskExecute (recommended) or a runtime agent_id returned by the same TaskExecute call.`;
}
function resolveTaskId(input, launchMap, tasks) {
  if (/^\d+$/.test(input)) return input;
  const matches2 = taskIdsOf(input, launchMap, tasks);
  if (matches2.length === 1) return matches2[0];
  if (matches2.length > 1) {
    throw new Error(`Runtime agent ID "${input}" matches multiple tasks: ${matches2.map((id) => `#${id}`).join(", ")}. Use a longer runtime ID or the stable task_id.`);
  }
  return input;
}

// src/wrap-output.ts
var DESCRIPTION2 = [
  "Retrieve output from a running or completed task.",
  "- task_id accepts the stable task_id or a runtime agent_id from TaskExecute.",
  "- Stable task_id values are recommended because they are the primary task identifier."
].join("\n");
function wrapTaskOutput(tool, launchMap) {
  if (typeof tool.execute !== "function") return { ...tool, description: DESCRIPTION2 };
  return {
    ...tool,
    description: DESCRIPTION2,
    execute: async (...args) => {
      const params = args[1] ?? {};
      const ctx = args[4] ?? {};
      const input = String(params.task_id ?? "");
      const task_id = resolveTaskId(input, launchMap, readTaskSnapshots(ctx));
      try {
        return await tool.execute(args[0], { ...params, task_id }, args[2], args[3], ctx);
      } catch (error) {
        if (task_id === input && looksLikeRuntimeId(input)) throw new Error(missingTaskIdMessage(input));
        throw error;
      }
    }
  };
}

// src/wrap.ts
function wrapTool(tool, launchMap) {
  if (tool.name === "TaskExecute") return wrapTaskExecute(tool, launchMap);
  if (tool.name === "TaskOutput") return wrapTaskOutput(tool, launchMap);
  return tool;
}
async function wrap_default(pi) {
  const launchMap = /* @__PURE__ */ new Map();
  const proxy = Object.create(pi);
  proxy.registerTool = (tool) => pi.registerTool(wrapTool(tool, launchMap));
  const specifier = "@jeonghyeon.net/pi-tasks/dist/index.js";
  const mod = await import(specifier);
  if (typeof mod.default === "function") await mod.default(proxy);
}
export {
  wrap_default as default
};
