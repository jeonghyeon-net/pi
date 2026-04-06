import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { createReportTool } from "./tool.js";
import { createUntilCommand } from "./cmd-until.js";
import { createUntilsCommand } from "./cmd-untils.js";
import { createCancelCommand } from "./cmd-cancel.js";
import { handleAgentStart, handleAgentEnd, filterContext, handleSessionStart, handleSessionShutdown } from "./handlers.js";

export default function (pi: ExtensionAPI) {
	pi.registerTool(createReportTool(pi.sendMessage.bind(pi), pi.sendUserMessage.bind(pi)));
	pi.registerCommand("until", createUntilCommand());
	pi.registerCommand("untils", createUntilsCommand(pi.sendMessage.bind(pi)));
	pi.registerCommand("until-cancel", createCancelCommand());
	pi.on("agent_start", async (_event, ctx) => {
		handleAgentStart(ctx);
	});
	pi.on("agent_end", async (_event, ctx) => {
		handleAgentEnd(ctx);
	});
	pi.on("context", async (event, _ctx) => {
		return filterContext(event);
	});
	pi.on("session_start", async (_event, ctx) => {
		handleSessionStart(ctx);
	});
	pi.on("session_shutdown", async () => {
		handleSessionShutdown();
	});
}
