import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { registerCommands, registerEvents, registerTool } from "./core/register.js";
import { createTaskManager } from "./core/tasks.js";

export default function (pi: ExtensionAPI) {
  const tm = createTaskManager(pi);
  registerTool(pi, tm);
  registerCommands(pi, tm);
  registerEvents(pi, tm);
}
