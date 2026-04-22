import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { registerSubagentsWrapper } from "./register-subagents";

export default function (pi: ExtensionAPI) {
	return registerSubagentsWrapper(arguments[0]);
}
