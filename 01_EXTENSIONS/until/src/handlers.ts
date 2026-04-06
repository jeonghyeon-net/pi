import type { ExtensionContext } from "@mariozechner/pi-coding-agent";
import { CUSTOM_TYPE } from "./constants.js";
import { setAgentRunning, setUi, clearAllTasks } from "./state.js";

export function handleAgentStart(ctx: ExtensionContext): void {
	setAgentRunning(true);
	if (ctx.hasUI) setUi(ctx.ui);
}

export function handleAgentEnd(ctx: ExtensionContext): void {
	setAgentRunning(false);
	if (ctx.hasUI) setUi(ctx.ui);
}

export function filterContext<T extends { role: string }>(
	event: { messages: T[] },
): { messages: T[] } | undefined {
	const filtered = event.messages.filter((m) => {
		if (m.role !== "custom") return true;
		const rec = m as Record<string, unknown>;
		return rec.customType !== CUSTOM_TYPE;
	});
	if (filtered.length === event.messages.length) return undefined;
	return { messages: filtered };
}

export function handleSessionStart(ctx: ExtensionContext): void {
	clearAllTasks();
	if (ctx.hasUI) setUi(ctx.ui);
}

export function handleSessionShutdown(): void {
	clearAllTasks();
}
