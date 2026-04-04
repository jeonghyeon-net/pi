import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import type { SubagentStore } from "./store.js";

export interface SubagentDeps {
  readonly pi: ExtensionAPI;
  readonly store: SubagentStore;
}
