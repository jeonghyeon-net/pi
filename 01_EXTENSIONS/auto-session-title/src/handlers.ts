import { isTitleableInput, resolveSessionTitle, type SessionTitleModel, type SessionTitleModelRegistry } from "./summarize.js";

export interface SessionTitleInput {
	source: "interactive" | "rpc" | "extension";
	text: string;
}

export interface SessionTitleRuntime {
	getSessionName(): string | undefined;
	setSessionName(name: string): void;
}

export interface SessionTitleContext {
	hasUI: boolean;
	cwd: string;
	model: SessionTitleModel | undefined;
	modelRegistry: SessionTitleModelRegistry;
	ui: { setTitle(title: string): void };
	sessionManager: {
		getSessionId(): string;
		getSessionName(): string | undefined;
		getEntries(): Array<{ type: string; message?: { role?: string } }>;
		getCwd(): string;
	};
}

export type PendingSessionTitles = Map<string, string>;

function hasUserMessages(ctx: SessionTitleContext): boolean {
	return ctx.sessionManager.getEntries().some((entry) => entry.type === "message" && entry.message?.role === "user");
}

function hasSessionTitle(runtime: SessionTitleRuntime, ctx: SessionTitleContext): boolean {
	return Boolean(runtime.getSessionName() || ctx.sessionManager.getSessionName());
}

export function buildTerminalTitle(_cwd: string, sessionName: string): string {
	return `π - ${sessionName}`;
}

export function handleInput(
	pending: PendingSessionTitles,
	runtime: SessionTitleRuntime,
	event: SessionTitleInput,
	ctx: SessionTitleContext,
): void {
	if (event.source === "extension" || hasSessionTitle(runtime, ctx) || hasUserMessages(ctx)) return;
	if (!isTitleableInput(event.text)) return;
	pending.set(ctx.sessionManager.getSessionId(), event.text);
}

export async function handleBeforeAgentStart(
	pending: PendingSessionTitles,
	runtime: SessionTitleRuntime,
	ctx: SessionTitleContext,
): Promise<void> {
	if (hasSessionTitle(runtime, ctx) || hasUserMessages(ctx)) return;
	const input = pending.get(ctx.sessionManager.getSessionId());
	if (!input) return;
	const title = await resolveSessionTitle(input, ctx.model, ctx.modelRegistry);
	if (!title) return;
	pending.delete(ctx.sessionManager.getSessionId());
	runtime.setSessionName(title);
	if (ctx.hasUI) ctx.ui.setTitle(buildTerminalTitle(ctx.cwd || ctx.sessionManager.getCwd(), title));
}
