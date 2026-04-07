import type { McpConfig } from "./types-config.js";
import type { ToolMetadata } from "./types-tool.js";
import type { ServerConnection } from "./types-server.js";
import { STATUS_KEY } from "./constants.js";

let generation = 0;
let config: McpConfig | null = null;
const connections = new Map<string, ServerConnection>();
const metadata = new Map<string, ToolMetadata[]>();

export function getGeneration(): number { return generation; }
export function incrementGeneration(): number { return ++generation; }

export function getConfig(): McpConfig | null { return config; }
export function setConfig(c: McpConfig): void { config = c; }

export function getConnections(): Map<string, ServerConnection> { return connections; }
export function setConnection(name: string, conn: ServerConnection): void { connections.set(name, conn); }
export function removeConnection(name: string): void { connections.delete(name); }

export function getMetadata(server: string): ToolMetadata[] | undefined { return metadata.get(server); }
export function setMetadata(server: string, tools: ToolMetadata[]): void { metadata.set(server, tools); }
export function getAllMetadata(): Map<string, ToolMetadata[]> { return metadata; }

interface FooterUi {
	setStatus(key: string, text: string | undefined): void;
	theme: { fg(color: string, text: string): string };
}

export function updateFooterStatus(ui: FooterUi, totalServers: number): void {
	const connected = connections.size;
	const text = ui.theme.fg("accent", `MCP: ${connected}/${totalServers} servers`);
	ui.setStatus(STATUS_KEY, text);
}

export function resetState(): void {
	generation = 0;
	config = null;
	connections.clear();
	metadata.clear();
}
