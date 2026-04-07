interface ServerInfo {
	name: string;
	status: string;
}

interface ToolEntry {
	name: string;
}

interface DescriptionState {
	getServers(): ServerInfo[];
	getMetadataMap(): Map<string, ToolEntry[]>;
}

const BASE = "MCP proxy tool. Actions: call, list, describe, search, status, connect.";

export function buildDescription(state: DescriptionState): string {
	const servers = state.getServers();
	if (servers.length === 0) return `${BASE}\nNo servers configured.`;
	const lines = servers.map((s) => formatServer(s, state.getMetadataMap()));
	return `${BASE}\nServers:\n${lines.join("\n")}`;
}

function formatServer(
	server: ServerInfo,
	metadata: Map<string, ToolEntry[]>,
): string {
	const tools = metadata.get(server.name);
	const count = tools ? tools.length : 0;
	const toolStr = count > 0 ? `${count} tool${count === 1 ? "" : "s"}` : "no tools";
	if (server.status === "connected") return `  - ${server.name}: ${toolStr}`;
	return `  - ${server.name}: ${toolStr} (${server.status})`;
}
