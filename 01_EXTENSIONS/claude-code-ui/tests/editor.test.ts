import type { KeybindingsManager } from "@mariozechner/pi-coding-agent";
import type { EditorTheme, TUI } from "@mariozechner/pi-tui";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@mariozechner/pi-coding-agent", () => ({
	CustomEditor: class {
		borderColor = (text: string) => `{${text}}`;
		lines = ["────", "body", "────"];
		constructor(..._args: unknown[]) {}
		render() { return this.lines; }
	},
}));

const { ClaudeCodeEditor } = await import("../src/editor.ts");

describe("ClaudeCodeEditor", () => {
	let editor: ClaudeCodeEditor & { lines: string[] };

	beforeEach(() => {
		editor = new ClaudeCodeEditor(
			{} as TUI,
			{} as EditorTheme,
			{} as KeybindingsManager,
		) as ClaudeCodeEditor & { lines: string[] };
	});

	it("decorates the top, body and bottom borders without extra spacing", () => {
		const lines = editor.render(32);
		expect(lines[0]).toContain("┌");
		expect(lines[1]).toContain("│");
		expect(lines[2]).toContain("└");
	});

	it("keeps unrelated lines untouched and still frames scroll states", () => {
		editor.lines = ["head", "body", "tail"];
		expect(editor.render(24)).toEqual(["head", "body", "tail"]);
		editor.lines = [];
		expect(editor.render(24)).toEqual([]);
		editor.lines = ["─── ↑ 2 more ", " body ", "─── ↓ 3 more "];
		const lines = editor.render(24);
		expect(lines[0]).toContain("┌");
		expect(lines[1]).toContain("│");
		expect(lines[2]).toContain("└");
	});
});
