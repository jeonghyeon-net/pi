import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { createLogger } from "./logger.js";

export default function (pi: ExtensionAPI) {
	createLogger("info", { ext: "mcp" });
}
