import { describe, expect, it, vi } from "vitest";
import { closeServer, closeAll } from "../src/server-close.js";
import type { ServerConnection } from "../src/types-server.js";
import { ServerPool } from "../src/server-pool.js";

function mockConn(name: string): ServerConnection {
	return {
		name,
		client: {
			callTool: vi.fn(), listTools: vi.fn(), listResources: vi.fn(),
			readResource: vi.fn(), ping: vi.fn(),
			close: vi.fn().mockResolvedValue(undefined),
		},
		transport: { close: vi.fn().mockResolvedValue(undefined) },
		status: "connected",
		lastUsedAt: Date.now(),
		inFlight: 0,
	};
}

describe("closeServer", () => {
	it("closes client and transport", async () => {
		const pool = new ServerPool();
		const conn = mockConn("s1");
		pool.add("s1", conn);
		await closeServer("s1", pool);
		expect(conn.client.close).toHaveBeenCalled();
		expect(conn.transport.close).toHaveBeenCalled();
	});

	it("removes from pool before async cleanup", async () => {
		const pool = new ServerPool();
		const conn = mockConn("s1");
		let removedBeforeClose = false;
		conn.client.close = vi.fn().mockImplementation(async () => {
			removedBeforeClose = pool.get("s1") === undefined;
		});
		pool.add("s1", conn);
		await closeServer("s1", pool);
		expect(removedBeforeClose).toBe(true);
	});

	it("no-op for missing server", async () => {
		const pool = new ServerPool();
		await expect(closeServer("none", pool)).resolves.toBeUndefined();
	});

	it("still closes transport if client.close fails", async () => {
		const pool = new ServerPool();
		const conn = mockConn("s1");
		conn.client.close = vi.fn().mockRejectedValue(new Error("client fail"));
		pool.add("s1", conn);
		await closeServer("s1", pool);
		expect(conn.transport.close).toHaveBeenCalled();
	});

	it("swallows transport.close error", async () => {
		const pool = new ServerPool();
		const conn = mockConn("s1");
		conn.transport.close = vi.fn().mockRejectedValue(new Error("transport fail"));
		pool.add("s1", conn);
		await expect(closeServer("s1", pool)).resolves.toBeUndefined();
	});
});

describe("closeAll", () => {
	it("closes all connections in pool", async () => {
		const pool = new ServerPool();
		const c1 = mockConn("s1");
		const c2 = mockConn("s2");
		pool.add("s1", c1);
		pool.add("s2", c2);
		await closeAll(pool);
		expect(c1.client.close).toHaveBeenCalled();
		expect(c2.client.close).toHaveBeenCalled();
		expect(pool.all().size).toBe(0);
	});

	it("handles empty pool", async () => {
		const pool = new ServerPool();
		await expect(closeAll(pool)).resolves.toBeUndefined();
	});

	it("continues closing others if one fails", async () => {
		const pool = new ServerPool();
		const c1 = mockConn("s1");
		c1.client.close = vi.fn().mockRejectedValue(new Error("fail"));
		const c2 = mockConn("s2");
		pool.add("s1", c1);
		pool.add("s2", c2);
		await closeAll(pool);
		expect(c2.client.close).toHaveBeenCalled();
	});
});
