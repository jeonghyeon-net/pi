import type { ExtensionContext } from "@mariozechner/pi-coding-agent";
import { applyAssistantMessagePatch } from "./assistant-message-patch.js";
import { applyClaudeChrome } from "./chrome.js";
import { applyLoaderPatch } from "./loader-patch.js";
import { applyToolExecutionPatch } from "./tool-execution-patch.js";

async function applyRuntimePatch(run: () => Promise<void>) {
	try {
		await run();
	} catch {}
}

export async function onSessionStart(_event: unknown, ctx: ExtensionContext) {
	if (!ctx.hasUI) return;
	await applyRuntimePatch(applyAssistantMessagePatch);
	await applyRuntimePatch(applyLoaderPatch);
	await applyRuntimePatch(applyToolExecutionPatch);
	applyClaudeChrome(ctx);
}
