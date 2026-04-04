import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { createReminderManager } from "./core/manager.js";
import { registerAll } from "./core/register.js";

export default function (pi: ExtensionAPI) {
  registerAll(pi, createReminderManager(pi));
}
