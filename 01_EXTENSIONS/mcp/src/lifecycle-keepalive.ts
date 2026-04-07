interface Logger {
	info(msg: string): void;
	warn(msg: string): void;
	error(msg: string): void;
	debug(msg: string): void;
}

interface KeepaliveClient {
	ping(): Promise<void>;
}

interface KeepaliveConn {
	name: string;
	client: KeepaliveClient;
	status: string;
}

interface KeepaliveOpts {
	connections: Map<string, KeepaliveConn>;
	servers: Record<string, { lifecycle?: string }>;
	reconnectFn: (name: string) => Promise<void>;
	intervalMs: number;
	logger?: Logger;
}

let timer: ReturnType<typeof setInterval> | null = null;

async function pingAll(opts: KeepaliveOpts): Promise<void> {
	for (const [name, conn] of opts.connections) {
		if (conn.status !== "connected") continue;
		if (opts.servers[name]?.lifecycle !== "keep-alive") continue;
		try {
			await conn.client.ping();
			opts.logger?.debug(`Ping OK: ${name}`);
		} catch {
			opts.logger?.warn(`Ping failed, reconnecting: ${name}`);
			opts.reconnectFn(name).catch(() => {});
		}
	}
}

export function startKeepalive(opts: KeepaliveOpts): void {
	stopKeepalive();
	timer = setInterval(() => { pingAll(opts).catch(() => {}); }, opts.intervalMs);
}

export function stopKeepalive(): void {
	if (timer !== null) {
		clearInterval(timer);
		timer = null;
	}
}
