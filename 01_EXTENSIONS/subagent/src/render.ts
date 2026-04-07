import { truncateToWidth } from "@mariozechner/pi-tui";
import type { RunResult } from "./types.js";
import { formatUsage, previewText } from "./format.js";
import { parseCommand } from "./cli.js";

export function buildCallText(params: { command: string }): string {
	try {
		const cmd = parseCommand(params.command);
		if (cmd.type === "run") return `▶ subagent run ${cmd.agent} -- ${cmd.task}`;
		if (cmd.type === "batch") return `▶ subagent batch (${cmd.items.length} tasks)`;
		if (cmd.type === "chain") return `▶ subagent chain (${cmd.steps.length} steps)`;
		if (cmd.type === "continue") return `▶ subagent continue #${cmd.id} -- ${cmd.task}`;
		if (cmd.type === "abort") return `▶ subagent abort #${cmd.id}`;
		if (cmd.type === "detail") return `▶ subagent detail #${cmd.id}`;
		return `▶ subagent ${params.command}`;
	} catch { return `▶ subagent ${params.command}`; }
}

export function buildResultText(result: RunResult): string {
	const header = `${result.agent} #${result.id}${result.task ? ` — ${previewText(result.task, 72)}` : ""}`;
	const footer = `${formatUsage(result.usage)}${result.stopReason ? ` / stop: ${result.stopReason}` : ""}`;
	if (result.error) {
		return `✗ ${header}\nerror: ${result.error}${result.output ? `\n\n${result.output}` : ""}\n\n${footer}`;
	}
	if (result.escalation) return `⚠ ${header} needs your input:\n${result.escalation}\n\nUse: subagent continue ${result.id} -- <your answer>`;
	return `✓ ${header}\n${result.output || "(no output)"}\n\n${footer}`;
}

function textComponent(text: string) {
	const lines = text.split("\n");
	return {
		render(width: number) {
			const safeWidth = Math.max(0, width);
			return lines.map((line) => truncateToWidth(line, safeWidth));
		},
		invalidate() {},
	};
}

export function renderCall(args: { command: string }) {
	return textComponent(buildCallText(args));
}

export function renderResult(result: { content: Array<{ type: string; text?: string }>; details?: { isError?: boolean } }) {
	const text = result.content
		.filter((c) => c.type === "text" && typeof c.text === "string")
		.map((c) => c.text)
		.join("\n");
	return textComponent(text);
}
