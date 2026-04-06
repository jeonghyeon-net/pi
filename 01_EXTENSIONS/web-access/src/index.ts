import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { createWebSearchTool, createCodeSearchTool, createFetchContentTool } from "./tools.js";

export default function (pi: ExtensionAPI) {
	pi.registerTool(createWebSearchTool());
	pi.registerTool(createCodeSearchTool());
	pi.registerTool(createFetchContentTool());
}
