import { describe, expect, it } from "vitest";
import { notifySessionStartHookResult } from "../src/notifications.ts";
import type { HookExecResult, RuntimeContextLike, UiLike } from "../src/types.ts";

function makeContext(hasUI = true): { ctx: RuntimeContextLike; notifications: Array<{ message: string; level: "info" | "warning" | "error" }> } {
	const notifications: Array<{ message: string; level: "info" | "warning" | "error" }> = [];
	const ui: UiLike = {
		notify: (message, level) => notifications.push({ message, level }),
		confirm: async () => true,
	};
	return {
		ctx: {
			cwd: "/tmp/demo",
			hasUI,
			ui,
			sessionManager: { getSessionId: () => "session-1", getEntries: () => [] },
		},
		notifications,
	};
}

function makeResult(overrides: Partial<HookExecResult> = {}): HookExecResult {
	return {
		command: "echo ok",
		code: 0,
		stdout: "",
		stderr: "",
		timedOut: false,
		json: null,
		...overrides,
	};
}

describe("notifications", () => {
	it("shows raw session-start hook output without the bridge prefix", () => {
		const { ctx, notifications } = makeContext();

		notifySessionStartHookResult(ctx, makeResult({ stdout: "  hello world  ", stderr: "  warning text  " }));

		expect(notifications).toEqual([
			{ message: "hello world", level: "info" },
			{ message: "warning text", level: "warning" },
		]);
	});

	it("skips notifications when the runtime has no UI", () => {
		const { ctx, notifications } = makeContext(false);

		notifySessionStartHookResult(ctx, makeResult({ stdout: "hello world" }));

		expect(notifications).toEqual([]);
	});
});
