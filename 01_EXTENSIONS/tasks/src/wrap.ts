import base from "@jeonghyeon.net/pi-tasks/dist/index.js";
import { wrapTaskExecute } from "./wrap-execute.js";
import { wrapTaskOutput } from "./wrap-output.js";
import type { PiLike, ToolLike } from "./types.js";

function wrapTool(tool: ToolLike, launchMap: Map<string, string>): ToolLike {
  if (tool.name === "TaskExecute") return wrapTaskExecute(tool, launchMap);
  if (tool.name === "TaskOutput") return wrapTaskOutput(tool, launchMap);
  return tool;
}

export default function (pi: PiLike): void {
  const launchMap = new Map<string, string>();
  const proxy = Object.create(pi) as PiLike;
  proxy.registerTool = (tool: ToolLike) => pi.registerTool(wrapTool(tool, launchMap));
  base(proxy);
}
