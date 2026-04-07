import { describe, expect, it } from "vitest";
import { applyUpdatedInput, toClaudeToolInput } from "../src/test-api.js";

describe("claude bridge tool mapping", () => {
	it("maps edit tool input into Claude Edit payload", () => {
		const mapped = toClaudeToolInput("edit", { path: "src/index.ts", edits: [{ oldText: "before", newText: "after" }] }, "/workspace/project");
		expect(mapped).toEqual({ tool_name: "Edit", tool_input: { file_path: "/workspace/project/src/index.ts", old_string: "before", new_string: "after", replace_all: undefined } });
	});

	it("maps grep options using pi's real input shape", () => {
		const mapped = toClaudeToolInput("grep", { pattern: "TODO", path: "src", glob: "*.ts", ignoreCase: true, literal: true, context: 2, limit: 5 }, "/workspace/project");
		expect(mapped).toEqual({ tool_name: "Grep", tool_input: { pattern: "TODO", path: "/workspace/project/src", glob: "*.ts", ignoreCase: true, literal: true, context: 2, limit: 5 } });
	});

	it("applies updated Claude bash input back onto pi bash input", () => {
		const input = { command: "go test ./...", timeout: 5 };
		applyUpdatedInput("bash", input, { command: "make test", timeout: 12000 });
		expect(input).toEqual({ command: "make test", timeout: 12 });
	});
});
