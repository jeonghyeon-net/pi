import { basename } from "node:path";
import registerSubagents from "@tintinweb/pi-subagents/dist/index.js";

export interface SessionManagerLike {
	getSessionId?: () => string | undefined;
	getSessionFile?: () => string | undefined;
}

export interface ToolContextLike {
	sessionManager?: SessionManagerLike;
}

export type ToolExecute = (
	toolCallId: string,
	params: Record<string, unknown>,
	signal: AbortSignal,
	onUpdate: (...args: unknown[]) => void,
	ctx: ToolContextLike,
) => unknown;

export interface ToolLike {
	name?: string;
	execute?: ToolExecute;
}

export interface PiLike {
	registerTool: (tool: ToolLike) => void;
}

const fallbackSessionIds = new WeakMap<object, string>();

export function getFallbackSessionId(sessionManager: SessionManagerLike): string {
	const cached = fallbackSessionIds.get(sessionManager);
	if (cached) return cached;

	const sessionFile = sessionManager.getSessionFile?.();
	const fileName =
		typeof sessionFile === "string" && sessionFile.length > 0
			? basename(sessionFile).replace(/\.[^.]+$/, "")
			: "";
	const fallback = fileName || `session-${Date.now().toString(36)}`;
	fallbackSessionIds.set(sessionManager, fallback);
	return fallback;
}

export function patchSessionManager(sessionManager: SessionManagerLike | undefined): void {
	if (!sessionManager) return;

	const originalGetSessionId = sessionManager.getSessionId;
	if (typeof originalGetSessionId === "function") {
		const current = originalGetSessionId();
		if (typeof current === "string" && current.length > 0) return;

		const fallback = getFallbackSessionId(sessionManager);
		sessionManager.getSessionId = () => {
			const next = originalGetSessionId();
			return typeof next === "string" && next.length > 0 ? next : fallback;
		};
		return;
	}

	const fallback = getFallbackSessionId(sessionManager);
	sessionManager.getSessionId = () => fallback;
}

export function wrapAgentTool(tool: ToolLike): ToolLike {
	if (tool.name !== "Agent" || typeof tool.execute !== "function") return tool;

	const originalExecute = tool.execute;
	return {
		...tool,
		execute(toolCallId, params, signal, onUpdate, ctx) {
			patchSessionManager(ctx.sessionManager);
			return originalExecute(toolCallId, params, signal, onUpdate, ctx);
		},
	};
}

function defaultRegisterSubagents(pi: PiLike): void {
	// @ts-expect-error upstream package ships older pi types; runtime registration still works.
	registerSubagents(pi);
}

export function registerSubagentsWrapper(
	pi: PiLike,
	registerImpl: ((pi: PiLike) => void) | undefined | null = defaultRegisterSubagents,
): void {
	const originalRegisterTool = pi.registerTool.bind(pi);
	pi.registerTool = (tool) => originalRegisterTool(wrapAgentTool(tool));
	try {
		if (registerImpl) registerImpl(pi);
	} finally {
		pi.registerTool = originalRegisterTool;
	}
}
