import type { Theme } from "@mariozechner/pi-coding-agent";

export function toolPrefix(theme: Theme, label: string) {
	return `${theme.fg("accent", "⏺")} ${theme.fg("toolTitle", theme.bold(label))}`;
}

export function inlineSuffix(theme: Theme, text?: string) {
	return text ? `${theme.fg("dim", " · ")}${text}` : "";
}

export function toolLabel(name: string) {
	if (name === "mcp") return "MCP";
	return name.split(/[-_]/).map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`).join(" ");
}

export function summarizeArgs(args: unknown, max = 72) {
	if (!args || typeof args !== "object" || Array.isArray(args)) return "";
	const record = args as Record<string, unknown>;
	const keys = ["action", "tool", "server", "query", "path", "taskId", "agent_id", "subject", "url", "command"];
	const parts = keys.map((key) => record[key]).filter((value) => typeof value === "string" || typeof value === "number").slice(0, 2).map(String);
	if (!parts.length) for (const [key, value] of Object.entries(record)) if ((typeof value === "string" || typeof value === "number" || typeof value === "boolean") && parts.push(`${key}=${value}`) >= 2) break;
	const text = parts.join(" · ");
	return text.length > max ? `${text.slice(0, max - 1)}…` : text;
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
