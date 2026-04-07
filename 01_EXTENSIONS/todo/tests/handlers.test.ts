import { describe, it, expect, vi, beforeEach } from "vitest";
import {
	onRestore, onBeforeAgentStart, onAgentStart,
	onAgentEnd, onMessageEnd, onCompact, onShutdown,
} from "../src/handlers.js";
import { addTodo, clearTodos } from "../src/state.js";
import { cleanupWidget } from "../src/widget.js";

type StubCtx = { hasUI: boolean; ui: { setWidget: ReturnType<typeof vi.fn> }; sessionManager: { getBranch(): unknown[] } };

function stubCtx(branch: unknown[] = []): StubCtx {
	return { hasUI: true, ui: { setWidget: vi.fn() }, sessionManager: { getBranch: () => branch } };
}

function stubPi() {
	return { appendEntry: vi.fn(), sendMessage: vi.fn() };
}

describe("handlers", () => {
	beforeEach(() => {
		clearTodos();
		cleanupWidget(stubCtx() as StubCtx);
	});

	it("onRestore calls syncWidget", async () => {
		const pi = stubPi();
		const ctx = stubCtx();
		await onRestore(pi)(undefined, ctx as StubCtx);
		expect(ctx.ui.setWidget).toHaveBeenCalled();
	});

	it("onBeforeAgentStart returns undefined when no context", async () => {
		expect(await onBeforeAgentStart()()).toBeUndefined();
	});

	it("onBeforeAgentStart returns message when todos exist", async () => {
		addTodo("test");
		const result = await onBeforeAgentStart()() as { message: { customType: string } };
		expect(result?.message.customType).toBe("todo-context");
	});

	it("onAgentStart sets running and syncs widget", async () => {
		const pi = stubPi();
		const ctx = stubCtx();
		await onAgentStart(pi)(undefined, ctx as StubCtx);
		expect(ctx.ui.setWidget).toHaveBeenCalled();
	});

	it("onAgentEnd clears running and persists", async () => {
		const pi = stubPi();
		const ctx = stubCtx();
		await onAgentEnd(pi)(undefined, ctx as StubCtx);
		expect(pi.appendEntry).toHaveBeenCalledWith("todo-state", expect.any(Object));
	});

	it("onMessageEnd increments turn and syncs", async () => {
		const pi = stubPi();
		const ctx = stubCtx();
		await onMessageEnd(pi)(undefined, ctx as StubCtx);
		expect(ctx.ui.setWidget).toHaveBeenCalled();
	});

	it("onCompact without todos does not send message", async () => {
		const pi = stubPi();
		const ctx = stubCtx();
		await onCompact(pi)(undefined, ctx as StubCtx);
		expect(pi.sendMessage).not.toHaveBeenCalled();
	});

	it("onCompact with active todos only syncs widget", async () => {
		const entry = { type: "custom", customType: "todo-state",
			data: { todos: [{ id: 1, text: "pending item", done: false }], nextId: 2, updatedAt: Date.now() } };
		const pi = stubPi();
		const ctx = stubCtx([entry]);
		await onCompact(pi)(undefined, ctx as StubCtx);
		expect(pi.sendMessage).not.toHaveBeenCalled();
		expect(ctx.ui.setWidget).toHaveBeenCalled();
	});

	it("onShutdown calls cleanupWidget", async () => {
		const ctx = stubCtx();
		await onShutdown()(undefined, ctx as StubCtx);
		expect(ctx.ui.setWidget).toHaveBeenCalledWith("todo", undefined);
	});
});
