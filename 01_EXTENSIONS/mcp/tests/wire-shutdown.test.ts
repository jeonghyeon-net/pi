import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../src/lifecycle-idle.js", () => ({ stopIdleTimer: vi.fn() }));
vi.mock("../src/lifecycle-keepalive.js", () => ({ stopKeepalive: vi.fn() }));
vi.mock("../src/state.js", () => ({
	resetState: vi.fn(),
	getConnections: vi.fn().mockReturnValue(new Map()),
	getConfig: vi.fn().mockReturnValue(null),
	getAllMetadata: vi.fn().mockReturnValue(new Map()),
}));
vi.mock("../src/logger.js", () => ({
	createLogger: vi.fn().mockReturnValue({
		debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(),
	}),
}));

import { wireShutdownOps } from "../src/wire-shutdown.js";
import { getConnections } from "../src/state.js";

describe("wire-shutdown", () => {
	beforeEach(() => vi.clearAllMocks());

	it("returns object with all required fields", () => {
		const ops = wireShutdownOps();
		expect(typeof ops.saveCache).toBe("function");
		expect(typeof ops.closeAll).toBe("function");
		expect(typeof ops.stopIdle).toBe("function");
		expect(typeof ops.stopKeepalive).toBe("function");
		expect(typeof ops.resetState).toBe("function");
		expect(typeof ops.logger.info).toBe("function");
	});

	it("saveCache resolves", async () => {
		const ops = wireShutdownOps();
		await expect(ops.saveCache()).resolves.toBeUndefined();
	});

	it("closeAll closes connections and cleans up", async () => {
		const mockClient = { close: vi.fn().mockResolvedValue(undefined) };
		const mockTransport = { close: vi.fn().mockResolvedValue(undefined) };
		const conn = { name: "s1", client: mockClient, transport: mockTransport, status: "connected", lastUsedAt: 0, inFlight: 0 };
		const conns = new Map([["s1", conn]]);
		vi.mocked(getConnections).mockReturnValue(conns);
		const ops = wireShutdownOps();
		await ops.closeAll();
		expect(conn.status).toBe("closed");
		expect(mockClient.close).toHaveBeenCalled();
		expect(mockTransport.close).toHaveBeenCalled();
	});

	it("closeAll handles client close error", async () => {
		const conn = {
			name: "s1",
			client: { close: vi.fn().mockRejectedValue(new Error("fail")) },
			transport: { close: vi.fn().mockResolvedValue(undefined) },
			status: "connected", lastUsedAt: 0, inFlight: 0,
		};
		vi.mocked(getConnections).mockReturnValue(new Map([["s1", conn]]));
		const ops = wireShutdownOps();
		await expect(ops.closeAll()).resolves.toBeUndefined();
	});

	it("closeAll handles transport close error", async () => {
		const conn = {
			name: "s1",
			client: { close: vi.fn().mockResolvedValue(undefined) },
			transport: { close: vi.fn().mockRejectedValue(new Error("fail")) },
			status: "connected", lastUsedAt: 0, inFlight: 0,
		};
		vi.mocked(getConnections).mockReturnValue(new Map([["s1", conn]]));
		const ops = wireShutdownOps();
		await expect(ops.closeAll()).resolves.toBeUndefined();
	});

	it("closeAll handles empty connections", async () => {
		vi.mocked(getConnections).mockReturnValue(new Map());
		const ops = wireShutdownOps();
		await expect(ops.closeAll()).resolves.toBeUndefined();
	});

	it("closeAll skips when connection vanishes mid-iteration", async () => {
		const conns = new Map([["s1", null]]);
		vi.mocked(getConnections).mockReturnValue(conns as ReturnType<typeof getConnections>);
		const ops = wireShutdownOps();
		await expect(ops.closeAll()).resolves.toBeUndefined();
	});
});
