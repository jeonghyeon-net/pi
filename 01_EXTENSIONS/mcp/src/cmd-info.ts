import type { ToolMetadata } from "./types-tool.js";
import type { FailureRecord } from "./failure-tracker.js";

type FailureLookup = (server: string) => FailureRecord | undefined;

export function formatStatus(
	conns: Map<string, unknown>,
	cfg: { mcpServers: Record<string, unknown> },
	meta: Map<string, ToolMetadata[]>,
	getFailureFn: FailureLookup,
): string {
	const names = Object.keys(cfg.mcpServers);
	if (names.length === 0) return "No servers configured.";
	return names.map((n) => statusLine(n, conns, meta, getFailureFn)).join("\n");
}

function statusLine(
	name: string,
	conns: Map<string, unknown>,
	meta: Map<string, ToolMetadata[]>,
	getFailureFn: FailureLookup,
): string {
	const conn = conns.get(name) as { status?: string } | undefined;
	const tools = meta.get(name) ?? [];
	const count = tools.length;
	const toolStr = count === 1 ? "1 tool" : `${count} tools`;
	if (!conn) return `  \u25CB ${name} (${meta.has(name) ? "cached" : "not connected"}) ${toolStr}`;
	if (conn.status === "connected") return `  \u2713 ${name} ${toolStr}`;
	const fail = getFailureFn(name);
	const ago = fail ? ` (${formatAgo(fail.at)})` : "";
	return `  \u2717 ${name} failed${ago} ${toolStr}`;
}

function formatAgo(ts: number): string {
	const diff = Math.floor((Date.now() - ts) / 1000);
	if (diff < 60) return `${diff}s ago`;
	if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
	return `${Math.floor(diff / 3600)}h ago`;
}

export function formatTools(
	meta: Map<string, ToolMetadata[]>,
	server: string | undefined,
): string {
	if (server) {
		const tools = meta.get(server);
		if (!tools || tools.length === 0) return `No tools found for "${server}".`;
		return toolList(server, tools);
	}
	const entries = [...meta.entries()];
	if (entries.length === 0) return "No tools available.";
	return entries.map(([s, t]) => toolList(s, t)).join("\n\n");
}

function toolList(server: string, tools: ToolMetadata[]): string {
	const header = `[${server}]`;
	const lines = tools.map((t) => `  ${t.originalName} - ${t.description}`);
	return [header, ...lines].join("\n");
}
