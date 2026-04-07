import type { ToolMetadata } from "./types-tool.js";

type MatchFn = (toolName: string) => boolean;

interface SearchHit {
	tool: ToolMetadata;
	server: string;
}

export function formatSearchResults(
	meta: Map<string, ToolMetadata[]>,
	query: string,
	matchFn: MatchFn,
): string {
	const hits = collectHits(meta, matchFn);
	if (hits.length === 0) return `No tools matching "${query}".`;
	const header = `Search results for "${query}" (${hits.length} found):`;
	const grouped = groupByServer(hits);
	const sections = grouped.map(([server, tools]) => formatGroup(server, tools));
	return [header, "", ...sections].join("\n");
}

function collectHits(
	meta: Map<string, ToolMetadata[]>,
	matchFn: MatchFn,
): SearchHit[] {
	const hits: SearchHit[] = [];
	for (const [server, tools] of meta) {
		for (const tool of tools) {
			if (matchFn(tool.originalName)) hits.push({ tool, server });
		}
	}
	return hits;
}

function groupByServer(hits: SearchHit[]): [string, ToolMetadata[]][] {
	const map = new Map<string, ToolMetadata[]>();
	for (const h of hits) {
		const list = map.get(h.server) ?? [];
		list.push(h.tool);
		map.set(h.server, list);
	}
	return [...map.entries()];
}

function formatGroup(server: string, tools: ToolMetadata[]): string {
	const lines = tools.map((t) => `  ${t.originalName} - ${t.description}`);
	return [`[${server}]`, ...lines].join("\n");
}
