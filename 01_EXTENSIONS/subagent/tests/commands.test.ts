import { describe, it, expect, vi } from "vitest";
import { buildSubCommand } from "../src/commands.js";

describe("buildSubCommand", () => {
	it("returns command with description", () => {
		const cmd = buildSubCommand("/nonexistent");
		expect(cmd.description).toContain("서브에이전트");
	});

	it("handler calls notify with help text", async () => {
		const cmd = buildSubCommand(`${import.meta.dirname}/../agents`);
		const notify = vi.fn();
		await cmd.handler("", { ui: { notify } });
		expect(notify).toHaveBeenCalledOnce();
		const text = notify.mock.calls[0][0];
		expect(text).toContain("/sub run");
		expect(text).toContain("에이전트:");
		expect(text).toContain("scout");
	});

	it("handler works with missing agents dir", async () => {
		const cmd = buildSubCommand("/nonexistent");
		const notify = vi.fn();
		await cmd.handler("", { ui: { notify } });
		expect(notify).toHaveBeenCalledOnce();
		expect(notify.mock.calls[0][0]).toContain("사용법:");
	});
});
