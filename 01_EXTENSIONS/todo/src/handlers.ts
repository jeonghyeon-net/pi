import type { ExtensionContext } from "@mariozechner/pi-coding-agent";
import { restoreFromEntries, buildEntry } from "./state.js";
import { buildTurnContext } from "./context.js";
import { syncWidget, setAgentRunning, incrementTurn, cleanupWidget, type Persister } from "./widget.js";

export function onRestore(pi: Persister) {
	return async (_e: unknown, ctx: ExtensionContext) => {
		restoreFromEntries(ctx.sessionManager.getBranch());
		syncWidget(ctx, pi);
	};
}

export function onBeforeAgentStart() {
	return async () => {
		const ctx = buildTurnContext();
		if (!ctx) return;
		return {
			message: { customType: "todo-context", content: ctx.content, display: ctx.display },
		};
	};
}

export function onAgentStart(pi: Persister) {
	return async (_e: unknown, ctx: ExtensionContext) => {
		setAgentRunning(true);
		syncWidget(ctx, pi);
	};
}

export function onAgentEnd(pi: Persister) {
	return async (_e: unknown, ctx: ExtensionContext) => {
		setAgentRunning(false);
		pi.appendEntry("todo-state", buildEntry());
		syncWidget(ctx, pi);
	};
}

export function onMessageEnd(pi: Persister) {
	return async (_e: unknown, ctx: ExtensionContext) => {
		incrementTurn();
		syncWidget(ctx, pi);
	};
}

export function onCompact(pi: Persister) {
	return async (_e: unknown, ctx: ExtensionContext) => {
		restoreFromEntries(ctx.sessionManager.getBranch());
		syncWidget(ctx, pi);
	};
}

export function onShutdown() {
	return async (_e: unknown, ctx: ExtensionContext) => {
		cleanupWidget(ctx);
	};
}
