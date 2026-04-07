import { describe, expect, it, beforeEach, vi } from "vitest";
import { ServerPool } from "../src/server-pool.js";
import type { ServerConnection } from "../src/types-server.js";

function mockConn(name: string): ServerConnection {
	return {
		name,
		client: {
			callTool: vi.fn(), listTools: vi.fn(), listResources: vi.fn(),
			readResource: vi.fn(), ping: vi.fn(), close: vi.fn(),
		},
		transport: { close: vi.fn() },
		status: "connected",
		lastUsedAt: Date.now(),
		inFlight: 0,
	};
}

describe("ServerPool", () => {
	let pool: ServerPool;
	beforeEach(() => { pool = new ServerPool(); });

	it("get returns undefined for missing server", () => {
		expect(pool.get("none")).toBeUndefined();
	});

	it("add and get round-trip", () => {
		const conn = mockConn("s1");
		pool.add("s1", conn);
		expect(pool.get("s1")).toBe(conn);
	});

	it("remove deletes connection", () => {
		pool.add("s1", mockConn("s1"));
		pool.remove("s1");
		expect(pool.get("s1")).toBeUndefined();
	});

	it("all returns all connections", () => {
		pool.add("s1", mockConn("s1"));
		pool.add("s2", mockConn("s2"));
		expect(pool.all().size).toBe(2);
	});

	it("dedup: concurrent connects share one promise", async () => {
		let resolveCount = 0;
		const connector = vi.fn().mockImplementation(async () => {
			resolveCount++;
			return mockConn("s1");
		});
		const [a, b] = await Promise.all([
			pool.getOrConnect("s1", connector),
			pool.getOrConnect("s1", connector),
		]);
		expect(a).toBe(b);
		expect(resolveCount).toBe(1);
	});

	it("dedup: clears pending on failure", async () => {
		const fail = vi.fn().mockRejectedValue(new Error("fail"));
		await expect(pool.getOrConnect("s1", fail)).rejects.toThrow("fail");
		const ok = vi.fn().mockResolvedValue(mockConn("s1"));
		const conn = await pool.getOrConnect("s1", ok);
		expect(conn.name).toBe("s1");
	});

	it("getOrConnect returns existing connection", async () => {
		const conn = mockConn("s1");
		pool.add("s1", conn);
		const connector = vi.fn();
		const result = await pool.getOrConnect("s1", connector);
		expect(result).toBe(conn);
		expect(connector).not.toHaveBeenCalled();
	});
});
