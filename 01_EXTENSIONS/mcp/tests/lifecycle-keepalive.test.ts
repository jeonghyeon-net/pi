import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { startKeepalive, stopKeepalive } from "../src/lifecycle-keepalive.js";

const kaServers: Record<string, { lifecycle?: string }> = { ka: { lifecycle: "keep-alive" } };
const mkReconnect = () => vi.fn<(n: string) => Promise<void>>().mockResolvedValue(undefined);
const mkConn = (ping: () => Promise<void>, status = "connected") =>
	new Map([["ka", { name: "ka", client: { ping }, status }]]);

describe("lifecycle-keepalive", () => {
	beforeEach(() => { vi.useFakeTimers(); stopKeepalive(); });
	afterEach(() => { stopKeepalive(); vi.useRealTimers(); });

	it("pings keep-alive servers on interval", async () => {
		const ping = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
		startKeepalive({ connections: mkConn(ping), servers: kaServers, reconnectFn: mkReconnect(), intervalMs: 30_000 });
		await vi.advanceTimersByTimeAsync(30_000);
		expect(ping).toHaveBeenCalledOnce();
	});

	it("triggers reconnect on ping failure", async () => {
		const ping = vi.fn<() => Promise<void>>().mockRejectedValue(new Error("timeout"));
		const reconnectFn = mkReconnect();
		startKeepalive({ connections: mkConn(ping), servers: kaServers, reconnectFn, intervalMs: 30_000 });
		await vi.advanceTimersByTimeAsync(30_000);
		expect(reconnectFn).toHaveBeenCalledWith("ka");
	});

	it("skips non-keep-alive servers", async () => {
		const ping = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
		const conns = new Map([["lazy", { name: "lazy", client: { ping }, status: "connected" }]]);
		startKeepalive({ connections: conns, servers: { lazy: {} }, reconnectFn: mkReconnect(), intervalMs: 30_000 });
		await vi.advanceTimersByTimeAsync(30_000);
		expect(ping).not.toHaveBeenCalled();
	});

	it("skips servers not in connected status", async () => {
		const ping = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
		startKeepalive({ connections: mkConn(ping, "failed"), servers: kaServers, reconnectFn: mkReconnect(), intervalMs: 30_000 });
		await vi.advanceTimersByTimeAsync(30_000);
		expect(ping).not.toHaveBeenCalled();
	});

	it("calls logger.debug on successful ping", async () => {
		const ping = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
		const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
		startKeepalive({ connections: mkConn(ping), servers: kaServers, reconnectFn: mkReconnect(), intervalMs: 30_000, logger });
		await vi.advanceTimersByTimeAsync(30_000);
		expect(logger.debug).toHaveBeenCalled();
	});

	it("calls logger.warn on ping failure", async () => {
		const ping = vi.fn<() => Promise<void>>().mockRejectedValue(new Error("timeout"));
		const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
		startKeepalive({ connections: mkConn(ping), servers: kaServers, reconnectFn: mkReconnect(), intervalMs: 30_000, logger });
		await vi.advanceTimersByTimeAsync(30_000);
		expect(logger.warn).toHaveBeenCalled();
	});

	it("stopKeepalive prevents further pings", async () => {
		const ping = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
		startKeepalive({ connections: mkConn(ping), servers: kaServers, reconnectFn: mkReconnect(), intervalMs: 30_000 });
		stopKeepalive();
		await vi.advanceTimersByTimeAsync(30_000);
		expect(ping).not.toHaveBeenCalled();
	});
});