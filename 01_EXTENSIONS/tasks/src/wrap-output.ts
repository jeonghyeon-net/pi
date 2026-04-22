import { readTaskSnapshots } from "./store-scan.js";
import { looksLikeRuntimeId, missingTaskIdMessage, resolveTaskId } from "./task-ref.js";
import type { ToolContextLike, ToolLike } from "./types.js";

const DESCRIPTION = [
  "Retrieve output from a running or completed task.",
  "- task_id accepts the stable task_id or a runtime agent_id from TaskExecute.",
  "- Stable task_id values are recommended because they are the primary task identifier.",
].join("\n");

export function wrapTaskOutput(tool: ToolLike, launchMap: Map<string, string>): ToolLike {
  if (typeof tool.execute !== "function") return { ...tool, description: DESCRIPTION };
  return {
    ...tool,
    description: DESCRIPTION,
    execute: async (...args: any[]) => {
      const params = args[1] ?? {};
      const ctx = (args[4] ?? {}) as ToolContextLike;
      const input = String(params.task_id ?? "");
      const task_id = resolveTaskId(input, launchMap, readTaskSnapshots(ctx));
      try {
        return await tool.execute!(args[0], { ...params, task_id }, args[2], args[3], ctx);
      } catch (error) {
        if (task_id === input && looksLikeRuntimeId(input)) throw new Error(missingTaskIdMessage(input));
        throw error;
      }
    },
  };
}
