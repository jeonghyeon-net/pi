import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../src/lifecycle-idle.js", () => ({ stopIdleTimer: vi.fn() }));
vi.mock("../src/lifecycle-keepalive.js", () => ({ stopKeepalive: vi.fn() }));
vi.mock("../src/state.js", () => ({
	resetState: vi.fn(), getConnections: vi.fn().mockReturnValue(new Map()),
	getConfig: vi.fn().mockReturnValue(null), getAllMetadata: vi.fn().mockReturnValue(new Map()),
}));
vi.mock("../src/logger.js", () => ({ createLogger: vi.fn().mockReturnValue({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }) }));
vi.mock("../src/wire-init-config.js", () => ({ wireSaveCache: vi.fn().mockReturnValue(vi.fn().mockResolvedValue(undefined)) }));
vi.mock("../src/config-hash.js", () => ({ computeConfigHash: vi.fn().mockReturnValue("hash123") }));

import { wireShutdownOps } from "../src/wire-shutdown.js";
import { getConnections, getConfig, getAllMetadata } from "../src/state.js";
import { wireSaveCache } from "../src/wire-init-config.js";

describe("wire-shutdown", () => {
	beforeEach(() => vi.clearAllMocks());
	it("returns all required fields", () => {
		const ops = wireShutdownOps();
		["saveCache","closeAll","stopIdle","stopKeepalive","resetState"].forEach((k) => expect(typeof (ops as Record<string, unknown>)[k]).toBe("function"));
		expect(typeof ops.logger.info).toBe("function");
	});
	it("saveCache resolves when no config", async () => { await expect(wireShutdownOps().saveCache()).resolves.toBeUndefined(); });
	it("saveCache delegates when config exists", async () => {
		vi.mocked(getConfig).mockReturnValue({ mcpServers: { s1: { command: "n" } } });
		vi.mocked(getAllMetadata).mockReturnValue(new Map([["s1", []]]));
		const saveFn = vi.fn().mockResolvedValue(undefined);
		vi.mocked(wireSaveCache).mockReturnValue(saveFn);
		await wireShutdownOps().saveCache(); expect(saveFn).toHaveBeenCalledWith("hash123", expect.any(Map));
	});
	it("closeAll closes connections", async () => {
		const mc = { close: vi.fn().mockResolvedValue(undefined) }; const mt = { close: vi.fn().mockResolvedValue(undefined) };
		const conn = { name: "s1", client: mc, transport: mt, status: "connected", lastUsedAt: 0, inFlight: 0 };
		vi.mocked(getConnections).mockReturnValue(new Map([["s1", conn]]));
		await wireShutdownOps().closeAll(); expect(conn.status).toBe("closed"); expect(mc.close).toHaveBeenCalled();
	});
	it("closeAll handles client close error", async () => {
		const conn = { name: "s1", client: { close: vi.fn().mockRejectedValue(new Error("f")) }, transport: { close: vi.fn().mockResolvedValue(undefined) }, status: "connected", lastUsedAt: 0, inFlight: 0 };
		vi.mocked(getConnections).mockReturnValue(new Map([["s1", conn]]));
		await expect(wireShutdownOps().closeAll()).resolves.toBeUndefined();
	});
	it("closeAll handles transport close error", async () => {
		const conn = { name: "s1", client: { close: vi.fn().mockResolvedValue(undefined) }, transport: { close: vi.fn().mockRejectedValue(new Error("f")) }, status: "connected", lastUsedAt: 0, inFlight: 0 };
		vi.mocked(getConnections).mockReturnValue(new Map([["s1", conn]]));
		await expect(wireShutdownOps().closeAll()).resolves.toBeUndefined();
	});
	it("closeAll handles empty connections", async () => { await expect(wireShutdownOps().closeAll()).resolves.toBeUndefined(); });
	it("closeAll skips vanished connection", async () => {
		vi.mocked(getConnections).mockReturnValue(new Map([["s1", null]]) as ReturnType<typeof getConnections>);
		await expect(wireShutdownOps().closeAll()).resolves.toBeUndefined();
	});
});
