import type { Theme } from "@mariozechner/pi-coding-agent";
import { stripAnsi } from "./ansi.js";

const META_LINE = /^(prompt|timestamp|frames|model):/i;
const TOOLISH_LINE = /^(fetch|get_|web_|code_|search|read|write|edit|bash|list|describe|connect|status)\b/i;

function clip(text: string, max: number) {
	return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function summarizeActionArgs(record: Record<string, unknown>, max: number) {
	const action = typeof record.action === "string" ? record.action : "";
	if (!action) return "";
	const tool = typeof record.tool === "string" ? toolLabel(record.tool) : "";
	const server = typeof record.server === "string" ? record.server : "";
	const query = typeof record.query === "string" ? `"${record.query}"` : "";
	const parts = [action === "call" && tool ? tool : action];
	if (action !== "call" && tool) parts.push(tool);
	if (server) parts.push(server);
	else if (query) parts.push(query);
	return clip(parts.join(" · "), max);
}

function cleanPreviewLine(line: string) {
	const text = stripAnsi(line).trim().replace(/\s+/g, " ");
	if (!text || text === "---" || text.startsWith("Use get_search_content(")) return "";
	if (META_LINE.test(text)) return "";
	const heading = text.match(/^\*\*(.+)\*\*$/)?.[1];
	const search = text.match(/^search \((.+)\)$/i)?.[1];
	return search ? `search · ${search}` : heading ?? text;
}

function shouldMergePreviewLine(line: string, next?: string) {
	return !!next && !line.includes(" · ") && !TOOLISH_LINE.test(next) && line.length <= 24 && !/[.!?…:]$/.test(line);
}

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
	const action = summarizeActionArgs(record, max);
	if (action) return action;
	const keys = ["tool", "server", "query", "path", "taskId", "agent_id", "subject", "url", "command"];
	const parts = keys.map((key) => record[key]).filter((value) => typeof value === "string" || typeof value === "number").slice(0, 2).map(String);
	if (!parts.length) for (const [key, value] of Object.entries(record)) if ((typeof value === "string" || typeof value === "number" || typeof value === "boolean") && parts.push(`${key}=${value}`) >= 2) break;
	return clip(parts.join(" · "), max);
}

export function branchBlock(theme: Theme, text: string) {
	const [first = "", ...rest] = text.split("\n");
	return [`${theme.fg("dim", "└ ")}${first}`, ...rest.map((line) => `${theme.fg("dim", "  ")}${line}`)].join("\n");
}

export function compactPreviewLines(text: string, maxLines: number, maxWidth = 88) {
	const raw = text.split("\n").map(cleanPreviewLine).filter(Boolean);
	const lines: string[] = [];
	for (let i = 0; i < raw.length; i++) {
		const line = raw[i]!;
		if (line === lines[lines.length - 1]) continue;
		const next = raw[i + 1];
		if (shouldMergePreviewLine(line, next)) {
			lines.push(clip(`${line} — ${next}`, maxWidth));
			i++;
			continue;
		}
		lines.push(clip(line, maxWidth));
	}
	if (lines.length <= maxLines) return lines;
	return [...lines.slice(0, maxLines - 1), clip(`… ${lines.length - maxLines + 1} more lines`, maxWidth)];
}

export function summarizeTextPreview(theme: Theme, text: string, maxLines: number) {
	return compactPreviewLines(text, maxLines).map((line) => theme.fg("toolOutput", line)).join("\n");
}
