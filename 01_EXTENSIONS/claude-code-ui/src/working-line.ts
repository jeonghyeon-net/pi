import type { AgentEndEvent, AgentStartEvent, ExtensionContext, SessionShutdownEvent, TurnStartEvent } from "@mariozechner/pi-coding-agent";
import { formatElapsed, formatWorkingLine } from "./working-line-format.js";

type ToolEvent = { toolName: string };
type MessageEvent = { assistantMessageEvent: { type: string } };
type WorkingCtx = { hasPendingMessages: () => boolean; ui: { setWorkingMessage(message?: string): void } };

const idleCtx: WorkingCtx = { hasPendingMessages: () => false, ui: { setWorkingMessage() {} } };
let activeCtx = idleCtx;
let activeTool: string | undefined;
let hasVisibleOutput = false;
let startedAt = 0;
let timer: ReturnType<typeof setInterval> | undefined;

function toolLabel(toolName: string) {
	return { bash: "Running bash", read: "Reading file", write: "Writing file", edit: "Editing file" }[toolName] ?? `Running ${toolName}`;
}

function renderWorkingLine() {
	if (activeTool) return activeCtx.ui.setWorkingMessage(formatWorkingLine([toolLabel(activeTool), formatElapsed(Date.now() - startedAt)]));
	if (hasVisibleOutput && !activeCtx.hasPendingMessages()) return activeCtx.ui.setWorkingMessage("");
	activeCtx.ui.setWorkingMessage(formatWorkingLine(["Working", formatElapsed(Date.now() - startedAt)]));
}

function beginTurn(ctx: WorkingCtx) {
	activeCtx = ctx;
	startedAt = Date.now();
	hasVisibleOutput = false;
	activeTool = undefined;
	renderWorkingLine();
	if (!timer) timer = setInterval(renderWorkingLine, 1000);
}

function resetWorkingLine(ctx: WorkingCtx = activeCtx) {
	if (timer) clearInterval(timer);
	timer = undefined;
	startedAt = 0;
	activeTool = undefined;
	hasVisibleOutput = false;
	ctx.ui.setWorkingMessage("");
	activeCtx = idleCtx;
}

export function onAgentStart(_event: AgentStartEvent, ctx: ExtensionContext) {
	if (!ctx.hasUI) return;
	resetWorkingLine();
	beginTurn(ctx);
}
export function onTurnStart(_event: TurnStartEvent, ctx: ExtensionContext) { if (ctx.hasUI) beginTurn(ctx); }

export function onToolExecutionStart(event: ToolEvent) {
	activeTool = event.toolName;
	renderWorkingLine();
}

export function onToolExecutionEnd(_event: object) {
	activeTool = undefined;
	renderWorkingLine();
}

export function onMessageUpdate(event: MessageEvent) {
	if (event.assistantMessageEvent.type.startsWith("text_")) hasVisibleOutput = true;
	renderWorkingLine();
}

export function onAgentEnd(_event: AgentEndEvent, ctx: ExtensionContext) { resetWorkingLine(ctx); }
export function onSessionShutdown(_event: SessionShutdownEvent, ctx: ExtensionContext) { resetWorkingLine(ctx); }
