import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { registerAll } from "./core/register.js";

export default function (pi: ExtensionAPI) {
  registerAll(pi);
}
