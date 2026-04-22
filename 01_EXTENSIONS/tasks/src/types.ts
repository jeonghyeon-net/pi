export const TASKS_WRAP_TYPES = "tasks-wrap-types";

export type TaskSnapshot = {
  id: string;
  owner?: string;
  metadata?: { agentId?: string };
};

export type ToolResult = {
  content?: Array<{ type?: string; text?: string; [key: string]: unknown }>;
  [key: string]: unknown;
};

export type ToolLike = {
  name?: string;
  description?: string;
  execute?: (...args: any[]) => any;
  [key: string]: unknown;
};

export type ToolContextLike = {
  cwd?: string;
  sessionManager?: { getSessionId?: () => string | undefined };
};

export type PiLike = {
  registerTool: (tool: ToolLike) => void;
  [key: string]: any;
};
