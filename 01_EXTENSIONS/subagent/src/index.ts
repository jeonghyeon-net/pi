import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { createTool } from "./tool.js";

export default function (pi: ExtensionAPI) {
	pi.registerTool(createTool(pi, ""));
}
