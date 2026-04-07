import { stopIdleTimer } from "./lifecycle-idle.js";
import { stopKeepalive } from "./lifecycle-keepalive.js";
import { resetState, getConnections, getConfig, getAllMetadata } from "./state.js";
import { wireSaveCache } from "./wire-init-config.js";

export interface ShutdownOps {
	saveCache: () => Promise<void>;
	closeAll: () => Promise<void>;
	stopIdle: () => void;
	stopKeepalive: () => void;
	resetState: () => void;
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
	const save = wireSaveCache();
	return {
		saveCache: async () => {
			const cfg = getConfig();
			if (!cfg) return;
			await save(cfg, getAllMetadata());
		},
		closeAll: closeAllConnections,
		stopIdle: stopIdleTimer,
		stopKeepalive,
		resetState,
	};
}
