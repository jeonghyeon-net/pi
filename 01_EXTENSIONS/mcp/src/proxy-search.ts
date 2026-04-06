import type { ToolMetadata } from "./types-tool.js";
import type { ProxyToolResult } from "./types-proxy.js";

type MatchFn = (toolName: string, query: string) => boolean;

interface SearchHit {
	serverName: string;
	name: string;
	description: string;
}

export function proxySearch(
	query: string,
	metadata: Map<string, ToolMetadata[]>,
	match: MatchFn,
): ProxyToolResult {
	const hits: SearchHit[] = [];
	for (const [server, tools] of metadata) {
		for (const tool of tools) {
			if (match(tool.name, query)) {
				hits.push({ serverName: server, name: tool.name, description: tool.description });
			}
		}
	}
	if (hits.length === 0) {
		return { content: [{ type: "text", text: `No tools found matching "${query}".` }] };
	}
	return { content: [{ type: "text", text: formatHits(hits) }] };
}

function formatHits(hits: SearchHit[]): string {
	const byServer = new Map<string, SearchHit[]>();
	for (const h of hits) {
		const list = byServer.get(h.serverName) ?? [];
		list.push(h);
		byServer.set(h.serverName, list);
	}
	const sections: string[] = [];
	for (const [server, tools] of byServer) {
		const lines = tools.map((t) => `  - ${t.name}: ${t.description}`);
		sections.push(`[${server}]\n${lines.join("\n")}`);
	}
	return sections.join("\n\n");
}
