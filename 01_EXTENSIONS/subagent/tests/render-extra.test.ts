import { describe, it, expect } from "vitest";
import { buildResultText } from "../src/render.js";

describe("buildResultText extra coverage", () => {
	it("includes task and stop reason on success", () => {
		const text = buildResultText({
			id: 9,
			agent: "reviewer",
			task: "review the production diff carefully",
			output: "looks good",
			usage: { inputTokens: 1, outputTokens: 2, turns: 1 },
			stopReason: "stop",
		});
		expect(text).toContain("review the production diff carefully");
		expect(text).toContain("stop: stop");
	});

	it("shows placeholder for empty success output", () => {
		const text = buildResultText({ id: 10, agent: "scout", output: "", usage: { inputTokens: 0, outputTokens: 0, turns: 0 } });
		expect(text).toContain("(no output)");
	});

	it("omits diagnostic body when error has no output", () => {
		const text = buildResultText({ id: 11, agent: "worker", output: "", error: "boom", usage: { inputTokens: 0, outputTokens: 0, turns: 0 } });
		expect(text).toContain("error: boom");
		expect(text).not.toContain("Subagent finished without");
	});

	it("includes diagnostic body when error output exists", () => {
		const text = buildResultText({ id: 12, agent: "worker", output: "diagnostic", error: "boom", usage: { inputTokens: 0, outputTokens: 0, turns: 0 } });
		expect(text).toContain("error: boom");
		expect(text).toContain("diagnostic");
	});
});
