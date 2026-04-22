import { CustomEditor, type KeybindingsManager } from "@mariozechner/pi-coding-agent";
import type { EditorTheme, TUI } from "@mariozechner/pi-tui";
import { stripAnsi } from "./ansi.js";
import { buildPromptFrame, findBottomRuleIndex, frameBodyLine } from "./rules.js";

export class ClaudeCodeEditor extends CustomEditor {
	constructor(tui: TUI, theme: EditorTheme, keybindings: KeybindingsManager) {
		super(tui, theme, keybindings, { paddingX: 2 });
	}

	override render(width: number) {
		const lines = super.render(width);
		if (lines.length === 0) return lines;
		const topFramed = this.isTopRule(lines[0]!);
		const bottomIndex = findBottomRuleIndex(lines);
		const bottomFramed = bottomIndex >= 0 && this.isBottomRule(lines[bottomIndex]!);
		if (topFramed) lines[0] = buildPromptFrame(width, "", "┌", "┐", this.borderColor);
		if (topFramed && bottomFramed) {
			for (let i = 1; i < bottomIndex; i++) lines[i] = frameBodyLine(lines[i]!, width, this.borderColor);
		}
		if (bottomFramed) lines[bottomIndex] = buildPromptFrame(width, "", "└", "┘", this.borderColor);
		return ["", ...lines];
	}

	private isTopRule(line: string) {
		const raw = stripAnsi(line);
		return /^─+$/.test(raw) || /^─── ↑ \d+ more /.test(raw);
	}

	private isBottomRule(line: string) {
		const raw = stripAnsi(line);
		return /^─+$/.test(raw) || /^─── ↓ \d+ more /.test(raw);
	}
}
