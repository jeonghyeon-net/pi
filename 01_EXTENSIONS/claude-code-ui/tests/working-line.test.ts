import type { AgentEndEvent, AgentStartEvent, ExtensionContext, SessionShutdownEvent } from "@mariozechner/pi-coding-agent";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WORKING_INDICATOR } from "../src/indicator.ts";
import { onAgentEnd, onAgentStart, onMessageUpdate, onSessionShutdown, onToolExecutionEnd, onToolExecutionStart } from "../src/working-line.ts";

const setWorkingIndicator = vi.fn();
const setWorkingMessage = vi.fn();
const ctx = { hasUI: true, ui: { setWorkingIndicator, setWorkingMessage } } as ExtensionContext;

describe("working-line handlers", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2024-01-01T00:00:00Z"));
		setWorkingIndicator.mockReset();
		setWorkingMessage.mockReset();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("keeps hidden reasoning quiet and only shows active tool progress", () => {
		onToolExecutionStart({ toolName: "bash" });
		onToolExecutionEnd({});
		onMessageUpdate({ assistantMessageEvent: { type: "text_delta" } });
		expect(setWorkingMessage).not.toHaveBeenCalled();
		onAgentStart({} as AgentStartEvent, { hasUI: false } as ExtensionContext);
		expect(setWorkingMessage).not.toHaveBeenCalled();
		onAgentStart({} as AgentStartEvent, ctx);
		vi.advanceTimersByTime(1000);
		expect(setWorkingIndicator.mock.lastCall).toEqual([WORKING_INDICATOR]);
		expect(setWorkingMessage.mock.lastCall).toEqual([""]);
		onToolExecutionStart({ toolName: "bash" });
		expect(setWorkingMessage.mock.lastCall?.[0]).toContain("Running bash");
		onToolExecutionStart({ toolName: "mcp" });
		expect(setWorkingMessage.mock.lastCall?.[0]).toContain("Running mcp");
		onMessageUpdate({ assistantMessageEvent: { type: "thinking_start" } });
		expect(setWorkingMessage.mock.lastCall?.[0]).toContain("Running mcp");
		onMessageUpdate({ assistantMessageEvent: { type: "thinking_end" } });
		expect(setWorkingMessage.mock.lastCall?.[0]).toContain("Running mcp");
		onMessageUpdate({ assistantMessageEvent: { type: "text_delta" } });
		expect(setWorkingMessage.mock.lastCall).toEqual([""]);
		onToolExecutionEnd({});
		expect(setWorkingMessage.mock.lastCall).toEqual([""]);
		onAgentEnd({} as AgentEndEvent, ctx);
		expect(setWorkingIndicator.mock.lastCall).toEqual([WORKING_INDICATOR]);
		expect(setWorkingMessage.mock.lastCall).toEqual([""]);
	});

	it("clears quietly on session shutdown", () => {
		onSessionShutdown({} as SessionShutdownEvent, ctx);
		expect(setWorkingIndicator.mock.lastCall).toEqual([WORKING_INDICATOR]);
		expect(setWorkingMessage.mock.lastCall).toEqual([""]);
	});
});
