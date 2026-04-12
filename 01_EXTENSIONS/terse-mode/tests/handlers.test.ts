import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_ENABLED, STYLE_PROMPT, STYLE_SECTION } from "../src/constants.js";
import { onBeforeAgentStart, onRestore } from "../src/handlers.js";
import { resetState, setEnabled } from "../src/state.js";

describe("handlers", () => {
	beforeEach(() => {
		resetState();
	});

	it("restores persisted global state", async () => {
		const loadState = vi.fn(async () => false);
		await onRestore(loadState)();

		const beforeAgentStart = onBeforeAgentStart();
		await expect(beforeAgentStart({ systemPrompt: "BASE" })).resolves.toBeUndefined();
	});

	it("falls back to default when global state load fails", async () => {
		setEnabled(false);
		await onRestore(async () => {
			throw new Error("boom");
		})();

		const beforeAgentStart = onBeforeAgentStart();
		await expect(beforeAgentStart({ systemPrompt: "BASE" })).resolves.toEqual({
			systemPrompt: `BASE\n\n${STYLE_SECTION}\n${STYLE_PROMPT}`,
		});
		expect(DEFAULT_ENABLED).toBe(true);
	});

	it("appends terse instructions when enabled", async () => {
		const beforeAgentStart = onBeforeAgentStart();
		await expect(beforeAgentStart({ systemPrompt: "BASE" })).resolves.toEqual({
			systemPrompt: `BASE\n\n${STYLE_SECTION}\n${STYLE_PROMPT}`,
		});
	});
});
