import { describe, expect, it, vi } from "vitest";
import {
	registerSubagentsWrapper,
	wrapAgentTool,
	type PiLike,
	type SessionManagerLike,
	type ToolLike,
} from "../src/register-subagents";

describe("register-subagents wrapper", () => {
	it("wraps only Agent tool", () => {
		const otherTool: ToolLike = { name: "read" };
		expect(wrapAgentTool(otherTool)).toBe(otherTool);

		const incompleteAgentTool: ToolLike = { name: "Agent" };
		expect(wrapAgentTool(incompleteAgentTool)).toBe(incompleteAgentTool);
	});

	it("patches session manager before Agent execute", () => {
		const execute = vi.fn();
		const tool = wrapAgentTool({ name: "Agent", execute });
		const sessionManager: SessionManagerLike = {
			getSessionId: () => undefined,
			getSessionFile: () => "/tmp/task-session.jsonl",
		};

		tool.execute?.("call", {}, new AbortController().signal, () => {}, { sessionManager });

		expect(sessionManager.getSessionId?.()).toBe("task-session");
		expect(execute).toHaveBeenCalledOnce();
	});

	it("wraps registerTool during upstream registration and restores it", () => {
		const registered: ToolLike[] = [];
		const pi: PiLike = {
			registerTool(tool) {
				registered.push(tool);
			},
		};

		registerSubagentsWrapper(pi, (wrappedPi) => {
			wrappedPi.registerTool({ name: "Agent", execute: () => undefined });
			wrappedPi.registerTool({ name: "read" });
		});

		expect(typeof registered[0]?.execute).toBe("function");
		expect(registered[1]?.name).toBe("read");

		const after: ToolLike[] = [];
		pi.registerTool = (tool) => after.push(tool);
		pi.registerTool({ name: "plain" });
		expect(after[0]?.name).toBe("plain");
	});

	it("restores registerTool after upstream failure and skips null registerer", () => {
		const registered: ToolLike[] = [];
		const pi: PiLike = {
			registerTool(tool) {
				registered.push(tool);
			},
		};

		expect(() =>
			registerSubagentsWrapper(pi, () => {
				throw new Error("boom");
			}),
		).toThrow("boom");

		registerSubagentsWrapper(pi, null);
		pi.registerTool({ name: "after-error" });
		expect(registered.at(-1)?.name).toBe("after-error");
	});
});
