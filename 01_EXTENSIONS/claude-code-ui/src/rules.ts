import { truncateToWidth, visibleWidth } from "@mariozechner/pi-tui";
import { stripAnsi } from "./ansi.js";

export function buildChromeRule(width: number, label: string, borderColor: (text: string) => string) {
	const prefix = borderColor("──");
	const labelPart = ` ${label} `;
	const suffixWidth = Math.max(0, width - visibleWidth(prefix) - visibleWidth(labelPart));
	return truncateToWidth(prefix + labelPart + borderColor("─".repeat(suffixWidth)), width, "");
}

export function buildPromptFrame(
	width: number,
	label: string,
	leftCorner: string,
	rightCorner: string,
	borderColor: (text: string) => string,
) {
	const left = borderColor(leftCorner);
	const right = borderColor(rightCorner);
	const insideWidth = Math.max(0, width - visibleWidth(left) - visibleWidth(right));
	const labelPart = label ? ` ${label} ` : "";
	const lead = insideWidth > 0 ? borderColor("─") : "";
	const fillWidth = Math.max(0, insideWidth - visibleWidth(lead) - visibleWidth(labelPart));
	return truncateToWidth(left + lead + labelPart + borderColor("─".repeat(fillWidth)) + right, width, "");
}

export function frameBodyLine(line: string, width: number, borderColor: (text: string) => string) {
	const innerWidth = Math.max(0, width - 2);
	const content = truncateToWidth(line, innerWidth, "");
	const padding = " ".repeat(Math.max(0, innerWidth - visibleWidth(content)));
	return borderColor("│") + content + padding + borderColor("│");
}

export function findBottomRuleIndex(lines: string[]) {
	for (let i = lines.length - 1; i >= 0; i--) {
		const raw = stripAnsi(lines[i]!);
		if (/^─+$/.test(raw) || /^─── ↓ \d+ more /.test(raw)) return i;
	}
	return -1;
}
