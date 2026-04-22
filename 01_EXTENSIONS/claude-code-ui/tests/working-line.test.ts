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

	it("hides idle thinking once visible output has started", () => {
		onToolExecutionStart({ toolName: "bash" });
		onToolExecutionEnd({});
		onMessageUpdate({ assistantMessageEvent: { type: "thinking_start" } });
		expect(setWorkingMessage).not.toHaveBeenCalled();
		onMessageUpdate({ assistantMessageEvent: { type: "thinking_end" } });
		expect(setWorkingMessage).not.toHaveBeenCalled();
		onMessageUpdate({ assistantMessageEvent: { type: "text_delta" } });
		expect(setWorkingMessage).not.toHaveBeenCalled();
		onAgentStart({} as AgentStartEvent, { hasUI: false } as ExtensionContext);
		expect(setWorkingMessage).not.toHaveBeenCalled();
		onAgentStart({} as AgentStartEvent, ctx);
		vi.advanceTimersByTime(1000);
		expect(setWorkingIndicator.mock.lastCall).toEqual([WORKING_INDICATOR]);
		expect(setWorkingMessage.mock.lastCall?.[0]).toContain("Thinking...");
		onToolExecutionStart({ toolName: "bash" });
		expect(setWorkingMessage.mock.lastCall?.[0]).toContain("Running bash");
		onMessageUpdate({ assistantMessageEvent: { type: "text_delta" } });
		expect(setWorkingMessage.mock.lastCall?.[0]).toContain("Running bash");
		onToolExecutionEnd({});
		expect(setWorkingIndicator.mock.lastCall).toEqual([{ frames: [] }]);
		expect(setWorkingMessage.mock.lastCall).toEqual([""]);
		onToolExecutionStart({ toolName: "mcp" });
		expect(setWorkingIndicator.mock.lastCall).toEqual([WORKING_INDICATOR]);
		expect(setWorkingMessage.mock.lastCall?.[0]).toContain("Running mcp");
		onToolExecutionEnd({});
		expect(setWorkingIndicator.mock.lastCall).toEqual([{ frames: [] }]);
		expect(setWorkingMessage.mock.lastCall).toEqual([""]);
		onAgentEnd({} as AgentEndEvent, ctx);
		expect(setWorkingIndicator.mock.lastCall).toEqual([WORKING_INDICATOR]);
		expect(setWorkingMessage.mock.lastCall).toEqual([]);
	});

	it("can clear on session shutdown without an active turn", () => {
		onSessionShutdown({} as SessionShutdownEvent, ctx);
		expect(setWorkingIndicator.mock.lastCall).toEqual([WORKING_INDICATOR]);
		expect(setWorkingMessage.mock.lastCall).toEqual([]);
	});
});
