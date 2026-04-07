import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { startIdleTimer, stopIdleTimer } from "../src/lifecycle-idle.js";

describe("lifecycle-idle", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		stopIdleTimer();
	});
	afterEach(() => {
		stopIdleTimer();
		vi.useRealTimers();
	});

	it("closes idle non-keep-alive servers after timeout", () => {
		const closeFn = vi.fn<(name: string) => Promise<void>>().mockResolvedValue(undefined);
		const now = Date.now();
		const connections = new Map([
			["idle-server", { name: "idle-server", lastUsedAt: now - 700_000, status: "connected" }],
		]);
		const servers: Record<string, { lifecycle?: string }> = { "idle-server": {} };
		startIdleTimer({ connections, servers, closeFn, timeoutMs: 600_000, intervalMs: 60_000 });
		vi.advanceTimersByTime(60_000);
		expect(closeFn).toHaveBeenCalledWith("idle-server");
	});

	it("skips keep-alive servers", () => {
		const closeFn = vi.fn<(name: string) => Promise<void>>().mockResolvedValue(undefined);
		const now = Date.now();
		const connections = new Map([
			["ka", { name: "ka", lastUsedAt: now - 700_000, status: "connected" }],
		]);
		const servers: Record<string, { lifecycle?: string }> = { ka: { lifecycle: "keep-alive" } };
		startIdleTimer({ connections, servers, closeFn, timeoutMs: 600_000, intervalMs: 60_000 });
		vi.advanceTimersByTime(60_000);
		expect(closeFn).not.toHaveBeenCalled();
	});

	it("skips recently-used servers", () => {
		const closeFn = vi.fn<(name: string) => Promise<void>>().mockResolvedValue(undefined);
		const connections = new Map([
			["active", { name: "active", lastUsedAt: Date.now(), status: "connected" }],
		]);
		const servers: Record<string, { lifecycle?: string }> = { active: {} };
		startIdleTimer({ connections, servers, closeFn, timeoutMs: 600_000, intervalMs: 60_000 });
		vi.advanceTimersByTime(60_000);
		expect(closeFn).not.toHaveBeenCalled();
	});

	it("stopIdleTimer prevents further checks", () => {
		const closeFn = vi.fn<(name: string) => Promise<void>>().mockResolvedValue(undefined);
		const connections = new Map([
			["s1", { name: "s1", lastUsedAt: Date.now() - 700_000, status: "connected" }],
		]);
		const servers: Record<string, { lifecycle?: string }> = { s1: {} };
		startIdleTimer({ connections, servers, closeFn, timeoutMs: 600_000, intervalMs: 60_000 });
		stopIdleTimer();
		vi.advanceTimersByTime(60_000);
		expect(closeFn).not.toHaveBeenCalled();
	});

	it("skips servers not in connected status", () => {
		const closeFn = vi.fn<(name: string) => Promise<void>>().mockResolvedValue(undefined);
		const connections = new Map([
			["s1", { name: "s1", lastUsedAt: Date.now() - 700_000, status: "closed" }],
		]);
		const servers: Record<string, { lifecycle?: string }> = { s1: {} };
		startIdleTimer({ connections, servers, closeFn, timeoutMs: 600_000, intervalMs: 60_000 });
		vi.advanceTimersByTime(60_000);
		expect(closeFn).not.toHaveBeenCalled();
	});

	it("calls logger.info when logger is provided", () => {
		const closeFn = vi.fn<(name: string) => Promise<void>>().mockResolvedValue(undefined);
		const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
		const now = Date.now();
		const connections = new Map([
			["s1", { name: "s1", lastUsedAt: now - 700_000, status: "connected" }],
		]);
		const servers: Record<string, { lifecycle?: string }> = { s1: {} };
		startIdleTimer({ connections, servers, closeFn, timeoutMs: 600_000, intervalMs: 60_000, logger });
		vi.advanceTimersByTime(60_000);
		expect(logger.info).toHaveBeenCalled();
	});

	it("uses per-server idleTimeout override", () => {
		const closeFn = vi.fn<(name: string) => Promise<void>>().mockResolvedValue(undefined);
		const now = Date.now();
		const connections = new Map([
			["s1", { name: "s1", lastUsedAt: now - 200_000, status: "connected" }],
		]);
		const servers: Record<string, { lifecycle?: string; idleTimeout?: number }> = {
			s1: { idleTimeout: 100_000 },
		};
		startIdleTimer({ connections, servers, closeFn, timeoutMs: 600_000, intervalMs: 60_000 });
		vi.advanceTimersByTime(60_000);
		expect(closeFn).toHaveBeenCalledWith("s1");
	});
});
