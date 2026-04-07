import type { ServerPool } from "./server-pool.js";

export async function closeServer(name: string, pool: ServerPool): Promise<void> {
	const conn = pool.get(name);
	if (!conn) return;
	pool.remove(name);
	try {
		await conn.client.close();
	} catch {
		// continue to transport cleanup
	}
	try {
		await conn.transport.close();
	} catch {
		// swallow transport close error
	}
}

export async function closeAll(pool: ServerPool): Promise<void> {
	const names = [...pool.all().keys()];
	await Promise.allSettled(names.map((name) => closeServer(name, pool)));
}
