import type { TaskSnapshot } from "./types.js";

function matches(value: string | undefined, input: string): boolean {
  return input.length > 0 && !!value && (value === input || value.startsWith(input));
}

function taskIdsOf(input: string, launchMap: Map<string, string>, tasks: TaskSnapshot[]): string[] {
  const ids = new Set<string>();
  for (const [agentId, taskId] of launchMap) if (matches(agentId, input)) ids.add(taskId);
  for (const task of tasks) {
    if (matches(task.metadata?.agentId, input) || matches(task.owner, input)) ids.add(task.id);
  }
  return [...ids];
}

export function looksLikeRuntimeId(input: string): boolean {
  return !/^\d+$/.test(input) && (input.includes("-") || /[a-f\d]{8,}/i.test(input));
}

export function missingTaskIdMessage(input: string): string {
  return `No task found for runtime agent ID \"${input}\". Use the stable task_id from TaskExecute (recommended) or a runtime agent_id returned by the same TaskExecute call.`;
}

export function resolveTaskId(input: string, launchMap: Map<string, string>, tasks: TaskSnapshot[]): string {
  if (/^\d+$/.test(input)) return input;
  const matches = taskIdsOf(input, launchMap, tasks);
  if (matches.length === 1) return matches[0]!;
  if (matches.length > 1) {
    throw new Error(`Runtime agent ID \"${input}\" matches multiple tasks: ${matches.map((id) => `#${id}`).join(", ")}. Use a longer runtime ID or the stable task_id.`);
  }
  return input;
}
