import { describe, it, expect } from "vitest";
import { collectOutput, buildMissingOutputDiagnostic } from "../src/runner.js";

describe("runner extra coverage", () => {
	it("falls back to agent_end output when message_end is missing", () => {
		const result = collectOutput([{ type: "agent_end", text: "from agent_end", usage: { inputTokens: 1, outputTokens: 2, turns: 1 }, stopReason: "stop" }]);
		expect(result.output).toBe("from agent_end");
		expect(result.source).toBe("agent_end");
		expect(result.stopReason).toBe("stop");
	});

	it("falls back to streamed deltas when final output is missing", () => {
		const result = collectOutput([{ type: "message_delta", text: "par" }, { type: "message_delta", text: "tial" }]);
		expect(result.output).toBe("partial");
		expect(result.source).toBe("stream");
	});

	it("tracks last tool preview and diagnostic fields", () => {
		const result = collectOutput([
			{ type: "tool_update", toolName: "bash", text: "git status" },
			{ type: "tool_end", toolName: "bash", text: "On branch main", isError: false },
		]);
		expect(result.lastToolName).toBe("bash");
		expect(result.lastToolText).toBe("On branch main");
		const diagnostic = buildMissingOutputDiagnostic({ ...result, stopReason: "error", stderr: "stderr text", exitCode: 0 });
		expect(diagnostic).toContain("stop reason: error");
		expect(diagnostic).toContain("last tool: bash");
		expect(diagnostic).toContain("stderr: stderr text");
	});
});
