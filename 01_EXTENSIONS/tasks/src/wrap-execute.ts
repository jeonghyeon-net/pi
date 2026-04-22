import { rememberLaunchedTasks, rewriteExecuteMessage } from "./execute-text.js";
import { readTextContent, replaceTextContent } from "./results.js";
import type { ToolLike, ToolResult } from "./types.js";

const DESCRIPTION = [
  "Execute one or more tasks as subagents.",
  "- The result shows stable task_id values and runtime agent_id values.",
  "- Use TaskOutput with the stable task_id (recommended) or the runtime agent_id.",
].join("\n");

export function wrapTaskExecute(tool: ToolLike, launchMap: Map<string, string>): ToolLike {
  if (typeof tool.execute !== "function") return { ...tool, description: DESCRIPTION };
  return {
    ...tool,
    description: DESCRIPTION,
    execute: async (...args: any[]): Promise<ToolResult> => {
      const result = await tool.execute!(...args);
      const text = readTextContent(result as ToolResult);
      rememberLaunchedTasks(text, launchMap);
      return replaceTextContent(result as ToolResult, rewriteExecuteMessage(text)) as ToolResult;
    },
  };
}
