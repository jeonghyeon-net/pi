import { formatStatus, formatTools } from "./cmd-info.js";
import { handleConnect, handleDisconnect, handleReconnect } from "./cmd-server.js";
import { handleAuth } from "./cmd-auth.js";
import { formatSearchResults } from "./cmd-search.js";
import { matchTool } from "./search.js";
import { getConnections, getConfig, getAllMetadata } from "./state.js";
import { getFailure } from "./failure-tracker.js";
import { OAUTH_TOKEN_DIR } from "./constants.js";
import type { ServerEntry } from "./types-config.js";

export interface CmdPi {
	sendMessage(msg: { customType: string; content: string; display: boolean }): void;
}

interface CommandContext { ui: { notify(msg: string, type?: "info" | "warning" | "error"): void } }

interface CommandDef {
	description: string;
	handler: (args: string, ctx: CommandContext) => Promise<void>;
}

type ConnectFn = (name: string, entry: ServerEntry) => Promise<void>;
type CloseFn = (name: string) => Promise<void>;

const VALID_CMDS = new Set(["status", "tools", "connect", "disconnect", "reconnect", "auth", "search"]);

export interface ParsedSub { cmd: string; arg: string | undefined }

export function parseSubcommand(raw: string): ParsedSub {
	const trimmed = raw.trim();
	if (!trimmed) return { cmd: "help", arg: undefined };
	const spaceIdx = trimmed.indexOf(" ");
	const cmd = spaceIdx === -1 ? trimmed : trimmed.slice(0, spaceIdx);
	const arg = spaceIdx === -1 ? undefined : trimmed.slice(spaceIdx + 1).trim();
	if (!VALID_CMDS.has(cmd)) return { cmd: "help", arg: undefined };
	return { cmd, arg };
}

export function createMcpCommand(
	_pi: CmdPi, connectFn?: ConnectFn, closeFn?: CloseFn,
): CommandDef {
	return {
		description: "MCP server management",
		handler: async (args: string, ctx: CommandContext) => {
			const { cmd, arg } = parseSubcommand(args);
			const notify = ctx.ui.notify.bind(ctx.ui);
			const cfg = getConfig() ?? { mcpServers: {} };
			const doConnect = connectFn ?? noopConnect;
			const doClose = closeFn ?? noopClose;
			await routeCommand(cmd, arg, cfg, notify, doConnect, doClose);
		},
	};
}

async function routeCommand(
	cmd: string, arg: string | undefined,
	cfg: { mcpServers: Record<string, ServerEntry> },
	notify: (msg: string, type?: "info" | "warning" | "error") => void,
	connectFn: ConnectFn, closeFn: CloseFn,
): Promise<void> {
	if (cmd === "status") {
		notify(formatStatus(getConnections(), cfg, getAllMetadata(), getFailure), "info");
	} else if (cmd === "tools") {
		notify(formatTools(getAllMetadata(), arg), "info");
	} else if (cmd === "connect") {
		if (!arg) { notify("Usage: /mcp connect <server>", "error"); return; }
		await handleConnect(arg, cfg, connectFn, notify);
	} else if (cmd === "disconnect") {
		if (!arg) { notify("Usage: /mcp disconnect <server>", "error"); return; }
		await handleDisconnect(arg, closeFn, notify);
	} else if (cmd === "reconnect") {
		await handleReconnect(arg, cfg, closeFn, connectFn, notify);
	} else if (cmd === "auth") {
		if (!arg) { notify("Usage: /mcp auth <server>", "error"); return; }
		handleAuth(arg, cfg, OAUTH_TOKEN_DIR, notify);
	} else if (cmd === "search") {
		if (!arg) { notify("Usage: /mcp search <query>", "error"); return; }
		notify(formatSearchResults(getAllMetadata(), arg, (n) => matchTool(n, arg)), "info");
	} else {
		showHelp(notify);
	}
}

function showHelp(notify: (msg: string, type?: "info" | "warning" | "error") => void): void {
	notify([
		"Usage: /mcp <subcommand>",
		"  status              - Server connection status",
		"  tools [server]      - List available tools",
		"  connect <server>    - Connect to a server",
		"  disconnect <server> - Disconnect from a server",
		"  reconnect [server]  - Reconnect (all or specific)",
		"  auth <server>       - Auth setup instructions",
		"  search <query>      - Search tools across servers",
	].join("\n"), "info");
}

async function noopConnect(): Promise<void> {}
async function noopClose(): Promise<void> {}
