import type { ToolMetadata } from "./types-tool.js";
import type { ProxyToolResult } from "./types-proxy.js";

type GetToolsFn = (server: string) => ToolMetadata[] | undefined;
type FindToolFn = (name: string) => ToolMetadata | undefined;
type FormatFn = (schema: unknown) => string;

interface ServerStatus {
	name: string;
	status: string;
}

export function proxyList(
	server: string | undefined,
	getTools: GetToolsFn,
): ProxyToolResult {
	if (!server) {
		return text("Provide a server name. Use action: \"status\" to see servers.");
	}
	const tools = getTools(server);
	if (!tools || tools.length === 0) return text(`No tools found for server "${server}".`);
	const lines = tools.map((t) => `  - ${t.name}: ${t.description}`);
	return text(`Tools on [${server}]:\n${lines.join("\n")}`);
}

export function proxyDescribe(
	toolName: string | undefined,
	find: FindToolFn,
	format: FormatFn,
): ProxyToolResult {
	if (!toolName) return text("Tool name is required for describe action.");
	const tool = find(toolName);
	if (!tool) return text(`Tool "${toolName}" not found. Try action: "search".`);
	const schema = format(tool.inputSchema);
	return text(`[${tool.serverName}] ${tool.name}: ${tool.description}\n\nParameters:\n${schema}`);
}

export function proxyStatus(servers: ServerStatus[]): ProxyToolResult {
	if (servers.length === 0) return text("No servers configured.");
	const lines = servers.map((s) => `  - ${s.name}: ${s.status}`);
	return text(`Server status:\n${lines.join("\n")}`);
}

function text(msg: string): ProxyToolResult {
	return { content: [{ type: "text", text: msg }] };
}
