import type { ServerEntry } from "./types-config.js";

type ConnectFn = (name: string, entry: ServerEntry) => Promise<void>;
type CloseFn = (name: string) => Promise<void>;
type NotifyFn = (msg: string, type?: "info" | "warning" | "error") => void;
type Config = { mcpServers: Record<string, ServerEntry> };

export async function handleConnect(
	name: string, cfg: Config, connectFn: ConnectFn, notify: NotifyFn,
): Promise<void> {
	const entry = cfg.mcpServers[name];
	if (!entry) { notify(`Server "${name}" not found in config.`, "error"); return; }
	try {
		await connectFn(name, entry);
		notify(`Connected to "${name}".`, "info");
	} catch (err) {
		notify(`Failed to connect "${name}": ${errorMsg(err)}`, "error");
	}
}

export async function handleDisconnect(
	name: string, closeFn: CloseFn, notify: NotifyFn,
): Promise<void> {
	try {
		await closeFn(name);
		notify(`Disconnected from "${name}".`, "info");
	} catch (err) {
		notify(`Failed to disconnect "${name}": ${errorMsg(err)}`, "error");
	}
}

export async function handleReconnect(
	name: string | undefined, cfg: Config,
	closeFn: CloseFn, connectFn: ConnectFn, notify: NotifyFn,
): Promise<void> {
	const targets = name ? [name] : Object.keys(cfg.mcpServers);
	if (name && !cfg.mcpServers[name]) {
		notify(`Server "${name}" not found in config.`, "error");
		return;
	}
	for (const n of targets) {
		try {
			await closeFn(n);
			await connectFn(n, cfg.mcpServers[n]);
			notify(`Reconnected to "${n}".`, "info");
		} catch (err) {
			notify(`Failed to reconnect "${n}": ${errorMsg(err)}`, "error");
		}
	}
}

function errorMsg(err: unknown): string {
	return err instanceof Error ? err.message : String(err);
}
