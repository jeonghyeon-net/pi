import { describe, expect, it, vi } from "vitest";
import { onSessionShutdown } from "../src/lifecycle-shutdown.js";

describe("lifecycle-shutdown", () => {
	const makeOps = () => ({
		saveCache: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
		closeAll: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
		stopIdle: vi.fn(),
		stopKeepalive: vi.fn(),
		resetState: vi.fn(),
		logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), child: vi.fn() },
	});

	it("calls dual-flush in order: saveCache then closeAll", async () => {
		const ops = makeOps();
		const order: string[] = [];
		ops.saveCache.mockImplementation(async () => { order.push("save"); });
		ops.closeAll.mockImplementation(async () => { order.push("close"); });
		const handler = onSessionShutdown(ops);
		await handler(undefined, undefined);
		expect(order).toEqual(["save", "close"]);
	});

	it("closeAll runs even if saveCache throws", async () => {
		const ops = makeOps();
		ops.saveCache.mockRejectedValue(new Error("disk full"));
		const handler = onSessionShutdown(ops);
		await handler(undefined, undefined);
		expect(ops.closeAll).toHaveBeenCalled();
		expect(ops.logger.error).toHaveBeenCalled();
	});

	it("stops timers before closing connections", async () => {
		const ops = makeOps();
		const order: string[] = [];
		ops.stopIdle.mockImplementation(() => { order.push("stopIdle"); });
		ops.stopKeepalive.mockImplementation(() => { order.push("stopKA"); });
		ops.saveCache.mockImplementation(async () => { order.push("save"); });
		const handler = onSessionShutdown(ops);
		await handler(undefined, undefined);
		expect(order[0]).toBe("stopIdle");
		expect(order[1]).toBe("stopKA");
	});

	it("calls resetState after everything", async () => {
		const ops = makeOps();
		const handler = onSessionShutdown(ops);
		await handler(undefined, undefined);
		expect(ops.resetState).toHaveBeenCalled();
	});

	it("resetState runs even if closeAll throws", async () => {
		const ops = makeOps();
		ops.closeAll.mockRejectedValue(new Error("stuck"));
		const handler = onSessionShutdown(ops);
		await handler(undefined, undefined);
		expect(ops.resetState).toHaveBeenCalled();
		expect(ops.logger.error).toHaveBeenCalled();
	});

	it("handles non-Error thrown from saveCache", async () => {
		const ops = makeOps();
		ops.saveCache.mockRejectedValue("string error");
		const handler = onSessionShutdown(ops);
		await handler(undefined, undefined);
		expect(ops.logger.error).toHaveBeenCalledWith("Cache save failed: string error");
	});

	it("handles non-Error thrown from closeAll", async () => {
		const ops = makeOps();
		ops.closeAll.mockRejectedValue(42);
		const handler = onSessionShutdown(ops);
		await handler(undefined, undefined);
		expect(ops.logger.error).toHaveBeenCalledWith("Close connections failed: 42");
	});

	it("returns no-op handler when called without ops", async () => {
		const handler = onSessionShutdown();
		await handler(undefined, undefined);
	});

	it("returns no-op handler when called with non-ShutdownOps", async () => {
		const handler = onSessionShutdown({ sendMessage: vi.fn() });
		await handler(undefined, undefined);
	});
});
