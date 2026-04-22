import type { Theme } from "@mariozechner/pi-coding-agent";

export function toolPrefix(theme: Theme, label: string) {
	return `${theme.fg("accent", "⏺")} ${theme.fg("toolTitle", theme.bold(label))}`;
}

export function inlineSuffix(theme: Theme, text?: string) {
	return text ? `${theme.fg("dim", " · ")}${text}` : "";
}

export function branchBlock(theme: Theme, text: string) {
	const [first = "", ...rest] = text.split("\n");
	return [`${theme.fg("dim", "  └ ")}${first}`, ...rest.map((line) => `${theme.fg("dim", "    ")}${line}`)].join("\n");
}

export function summarizeTextPreview(theme: Theme, text: string, maxLines: number) {
	const lines = text.split("\n");
	const preview = lines.slice(0, maxLines).map((line) => theme.fg("toolOutput", line));
	if (lines.length > maxLines) preview.push(theme.fg("dim", `… ${lines.length - maxLines} more lines`));
	return preview.join("\n");
}
