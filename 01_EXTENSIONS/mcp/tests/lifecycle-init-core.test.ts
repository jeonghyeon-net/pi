import { describe, expect, it, vi } from "vitest";
import { onSessionStart } from "../src/lifecycle-init.js";
import { makeDeps, mockPi, run } from "./lifecycle-init-test-helpers.js";

describe("lifecycle-init core", () => {
	it("loads config and connects eager servers", async () => {
		const deps = makeDeps();
		await run(deps);
		expect(deps.loadConfig).toHaveBeenCalled();
		expect(deps.connectServer).toHaveBeenCalledWith("s1", expect.anything());
	});

	it("handles lazy, keep-alive, and direct tools", async () => {
		const lazy = makeDeps({ loadConfig: vi.fn().mockResolvedValue({ mcpServers: { s1: { lifecycle: "lazy" } } }) });
		await run(lazy);
		expect(lazy.connectServer).not.toHaveBeenCalled();
		const keepAlive = makeDeps({
			loadConfig: vi.fn().mockResolvedValue({ mcpServers: { ka: { lifecycle: "keep-alive" } } }),
			connectServer: vi.fn().mockResolvedValue({ name: "ka", client: {}, status: "connected" }),
		});
		await run(keepAlive);
		expect(keepAlive.connectServer).toHaveBeenCalledWith("ka", expect.anything());
		const spec = { serverName: "s1", originalName: "t1", prefixedName: "s1_t1", description: "d" };
		const direct = makeDeps({ resolveDirectTools: vi.fn().mockReturnValue([spec]) });
		await run(direct);
		expect(direct.registerDirectTools).toHaveBeenCalled();
	});

	it("starts timers, updates footer, and still connects eager servers with cache", async () => {
		const deps = makeDeps();
		await run(deps);
		expect(deps.startIdleTimer).toHaveBeenCalled();
		expect(deps.startKeepalive).toHaveBeenCalled();
		expect(deps.updateFooter).toHaveBeenCalled();
		const cached = makeDeps({
			loadCache: vi.fn().mockReturnValue({ hash: "hash1", servers: { s1: { tools: [{ name: "t1" }], savedAt: Date.now() } } }),
			isCacheValid: vi.fn().mockReturnValue(true),
		});
		await run(cached);
		expect(cached.connectServer).toHaveBeenCalled();
	});

	it("returns no-op without deps and still applies env in normal flow", async () => {
		await onSessionStart(mockPi())(undefined, undefined);
		const deps = makeDeps();
		await run(deps);
		expect(deps.applyDirectToolsEnv).toHaveBeenCalled();
	});
});
