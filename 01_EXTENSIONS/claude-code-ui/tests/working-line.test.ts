import type { AgentEndEvent, AgentStartEvent, ExtensionContext, SessionShutdownEvent } from "@mariozechner/pi-coding-agent";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { onAgentEnd, onAgentStart, onMessageUpdate, onSessionShutdown, onToolExecutionEnd, onToolExecutionStart } from "../src/working-line.ts";

const setWorkingMessage = vi.fn();
const ctx = { hasUI: true, ui: { setWorkingMessage } } as ExtensionContext;

describe("working-line handlers", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2024-01-01T00:00:00Z"));
		setWorkingMessage.mockReset();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("hides idle thinking once visible output has started", () => {
		onToolExecutionStart({ toolName: "bash" });
		onToolExecutionEnd({});
		onMessageUpdate({ assistantMessageEvent: { type: "text_delta" } });
		expect(setWorkingMessage).not.toHaveBeenCalled();
		onAgentStart({} as AgentStartEvent, { hasUI: false } as ExtensionContext);
		expect(setWorkingMessage).not.toHaveBeenCalled();
		onAgentStart({} as AgentStartEvent, ctx);
		expect(setWorkingMessage.mock.lastCall?.[0]).toContain("Thinking...");
		onToolExecutionStart({ toolName: "bash" });
		expect(setWorkingMessage.mock.lastCall?.[0]).toContain("Running bash");
		onMessageUpdate({ assistantMessageEvent: { type: "text_delta" } });
		expect(setWorkingMessage.mock.lastCall?.[0]).toContain("Running bash");
		onToolExecutionEnd({});
		expect(setWorkingMessage.mock.lastCall).toEqual([undefined]);
		onToolExecutionStart({ toolName: "mcp" });
		expect(setWorkingMessage.mock.lastCall?.[0]).toContain("Running mcp");
		onToolExecutionEnd({});
		expect(setWorkingMessage.mock.lastCall).toEqual([undefined]);
		onAgentEnd({} as AgentEndEvent, ctx);
		expect(setWorkingMessage.mock.lastCall).toEqual([]);
	});

	it("can clear on session shutdown without an active turn", () => {
		onSessionShutdown({} as SessionShutdownEvent, ctx);
		expect(setWorkingMessage.mock.lastCall).toEqual([]);
	});
});
