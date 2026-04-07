interface Logger {
	info(msg: string): void;
	warn(msg: string): void;
	error(msg: string): void;
	debug(msg: string): void;
}

interface IdleConn {
	name: string;
	lastUsedAt: number;
	status: string;
}

interface IdleOpts {
	connections: Map<string, IdleConn>;
	servers: Record<string, { lifecycle?: string; idleTimeout?: number }>;
	closeFn: (name: string) => Promise<void>;
	timeoutMs: number;
	intervalMs: number;
	logger?: Logger;
}

let timer: ReturnType<typeof setInterval> | null = null;

function checkIdle(opts: IdleOpts): void {
	const now = Date.now();
	for (const [name, conn] of opts.connections) {
		if (conn.status !== "connected") continue;
		const serverDef = opts.servers[name];
		if (serverDef?.lifecycle === "keep-alive") continue;
		const timeout = serverDef?.idleTimeout ?? opts.timeoutMs;
		if (now - conn.lastUsedAt > timeout) {
			opts.logger?.info(`Closing idle server: ${name}`);
			opts.closeFn(name).catch(() => {});
		}
	}
}

export function startIdleTimer(opts: IdleOpts): void {
	stopIdleTimer();
	timer = setInterval(() => checkIdle(opts), opts.intervalMs);
}

export function stopIdleTimer(): void {
	if (timer !== null) {
		clearInterval(timer);
		timer = null;
	}
}
