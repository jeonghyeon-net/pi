import { stopIdleTimer } from "./lifecycle-idle.js";
import { stopKeepalive } from "./lifecycle-keepalive.js";
import { resetState, getConnections, getConfig, getAllMetadata } from "./state.js";
import { createLogger } from "./logger.js";
import { wireSaveCache } from "./wire-init-config.js";
import { computeConfigHash } from "./config-hash.js";

interface Logger { info(m: string): void; warn(m: string): void; error(m: string): void; debug(m: string): void }

export interface ShutdownOps {
	saveCache: () => Promise<void>;
	closeAll: () => Promise<void>;
	stopIdle: () => void;
	stopKeepalive: () => void;
	resetState: () => void;
	logger: Logger;
}

async function closeAllConnections(): Promise<void> {
	const conns = getConnections();
	const names = [...conns.keys()];
	await Promise.allSettled(names.map(async (name) => {
		const conn = conns.get(name);
		if (!conn) return;
		conn.status = "closed";
		conns.delete(name);
		try { await conn.client.close(); } catch { /* swallow */ }
		try { await conn.transport.close(); } catch { /* swallow */ }
	}));
}

export function wireShutdownOps(): ShutdownOps {
	const logger = createLogger("info", { module: "shutdown" });
	const save = wireSaveCache();
	return {
		saveCache: async () => {
			const cfg = getConfig();
			if (!cfg) return;
			await save(computeConfigHash(cfg), getAllMetadata());
		},
		closeAll: closeAllConnections,
		stopIdle: stopIdleTimer,
		stopKeepalive,
		resetState,
		logger,
	};
}
