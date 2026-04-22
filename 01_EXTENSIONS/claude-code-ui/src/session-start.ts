import type { ExtensionContext } from "@mariozechner/pi-coding-agent";
import { applyAssistantMessagePatch } from "./assistant-message-patch.js";
import { applyClaudeChrome } from "./chrome.js";
import { applyLoaderPatch } from "./loader-patch.js";

export async function onSessionStart(_event: unknown, ctx: ExtensionContext) {
	if (!ctx.hasUI) return;
	await applyAssistantMessagePatch();
	await applyLoaderPatch();
	applyClaudeChrome(ctx);
}
