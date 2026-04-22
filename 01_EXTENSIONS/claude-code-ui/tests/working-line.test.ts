import type { AgentEndEvent, AgentStartEvent, ExtensionContext, SessionShutdownEvent, TurnStartEvent } from "@mariozechner/pi-coding-agent";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { onAgentEnd, onAgentStart, onMessageUpdate, onSessionShutdown, onToolExecutionEnd, onToolExecutionStart, onTurnStart } from "../src/working-line.ts";

const setWorkingMessage = vi.fn();
let pendingMessages = false;
const ctx = { hasUI: true, hasPendingMessages: () => pendingMessages, ui: { setWorkingMessage } } as ExtensionContext;

describe("working-line handlers", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2024-01-01T00:00:00Z"));
		pendingMessages = false;
		setWorkingMessage.mockReset();
	});

	afterEach(() => { vi.useRealTimers(); });

	it("keeps the working line alive for queued steering and new turns", () => {
		onToolExecutionStart({ toolName: "bash" });
		onToolExecutionEnd({});
		onMessageUpdate({ assistantMessageEvent: { type: "text_delta" } });
		expect(setWorkingMessage).not.toHaveBeenCalled();
		onAgentStart({} as AgentStartEvent, { hasUI: false } as ExtensionContext);
		expect(setWorkingMessage).not.toHaveBeenCalled();
		onAgentStart({} as AgentStartEvent, ctx);
		expect(setWorkingMessage.mock.lastCall).toEqual(["Working · 0s"]);
		vi.advanceTimersByTime(1000);
		expect(setWorkingMessage.mock.lastCall).toEqual(["Working · 1s"]);
		onToolExecutionStart({ toolName: "bash" });
		expect(setWorkingMessage.mock.lastCall?.[0]).toContain("Running bash");
		onToolExecutionStart({ toolName: "mcp" });
		expect(setWorkingMessage.mock.lastCall?.[0]).toContain("Running mcp");
		onMessageUpdate({ assistantMessageEvent: { type: "thinking_start" } });
		expect(setWorkingMessage.mock.lastCall?.[0]).toContain("Running mcp");
		onToolExecutionEnd({});
		expect(setWorkingMessage.mock.lastCall?.[0]).toContain("Working · 1s");
		onMessageUpdate({ assistantMessageEvent: { type: "text_start" } });
		expect(setWorkingMessage.mock.lastCall).toEqual([""]);
		pendingMessages = true;
		vi.advanceTimersByTime(1000);
		expect(setWorkingMessage.mock.lastCall).toEqual(["Working · 2s"]);
		onTurnStart({} as TurnStartEvent, ctx);
		expect(setWorkingMessage.mock.lastCall).toEqual(["Working · 0s"]);
		pendingMessages = false;
		onMessageUpdate({ assistantMessageEvent: { type: "text_delta" } });
		expect(setWorkingMessage.mock.lastCall).toEqual([""]);
		onAgentEnd({} as AgentEndEvent, ctx);
		expect(setWorkingMessage.mock.lastCall).toEqual([""]);
	});

	it("clears quietly on session shutdown", () => {
		onSessionShutdown({} as SessionShutdownEvent, ctx);
		expect(setWorkingMessage.mock.lastCall).toEqual([""]);
	});
});
