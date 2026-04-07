interface Logger {
	info(msg: string): void;
	warn(msg: string): void;
	error(msg: string): void;
	debug(msg: string): void;
}

interface ShutdownOps {
	saveCache: () => Promise<void>;
	closeAll: () => Promise<void>;
	stopIdle: () => void;
	stopKeepalive: () => void;
	resetState: () => void;
	logger: Logger;
}

function isShutdownOps(v: unknown): v is ShutdownOps {
	return typeof v === "object" && v !== null && "closeAll" in v;
}

export function onSessionShutdown(opsOrPi?: unknown) {
	const ops = isShutdownOps(opsOrPi) ? opsOrPi : undefined;
	return async (_event: unknown, _ctx: unknown): Promise<void> => {
		if (!ops) return;
		ops.logger.info("Session shutdown starting");
		ops.stopIdle();
		ops.stopKeepalive();
		try {
			await ops.saveCache();
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			ops.logger.error(`Cache save failed: ${msg}`);
		}
		try {
			await ops.closeAll();
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			ops.logger.error(`Close connections failed: ${msg}`);
		}
		ops.resetState();
		ops.logger.info("Session shutdown complete");
	};
}
