import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../src/content-transform.js", () => ({ transformContent: vi.fn().mockReturnValue({ type: "text", text: "t" }) }));
vi.mock("../src/state.js", () => ({ getAllMetadata: vi.fn().mockReturnValue(new Map()), getMetadata: vi.fn().mockReturnValue(undefined), getConfig: vi.fn().mockReturnValue({ mcpServers: { s1: { command: "node" } } }), getConnections: vi.fn().mockReturnValue(new Map()) }));
vi.mock("../src/failure-tracker.js", () => ({ getBackoffMs: vi.fn().mockReturnValue(0), getFailure: vi.fn().mockReturnValue(undefined) }));
vi.mock("../src/consent.js", () => ({ createConsentManager: vi.fn().mockReturnValue({ needsConsent: vi.fn().mockReturnValue(false), recordApproval: vi.fn() }) }));

import { buildCallDeps, buildServerStatuses, findToolInMetadata } from "../src/wire-proxy.js";
import { getAllMetadata, getConfig, getConnections } from "../src/state.js";

describe("wire-proxy state helpers", () => {
	beforeEach(() => vi.clearAllMocks());
	it("finds tools in metadata", () => {
		const t = { name: "t1", originalName: "t1", serverName: "s1", description: "" };
		vi.mocked(getAllMetadata).mockReturnValue(new Map([["s1", [t]]]));
		expect(findToolInMetadata("t1")).toBe(t);
		vi.mocked(getAllMetadata).mockReturnValue(new Map());
		expect(findToolInMetadata("t1")).toBeUndefined();
	});
	it("builds server statuses including cached empty metadata", () => {
		vi.mocked(getConfig).mockReturnValue(null); expect(buildServerStatuses()).toEqual([]);
		vi.mocked(getConfig).mockReturnValue({ mcpServers: { s1: { command: "n" } } });
		vi.mocked(getConnections).mockReturnValue(new Map([["s1", { name: "s1", status: "connected" }]]));
		expect(buildServerStatuses()).toEqual([{ name: "s1", status: "connected", cached: false }]);
		vi.mocked(getConnections).mockReturnValue(new Map());
		vi.mocked(getAllMetadata).mockReturnValue(new Map([["s1", [{ name: "t1", originalName: "t1", serverName: "s1", description: "" }]]]));
		expect(buildServerStatuses()).toEqual([{ name: "s1", status: "not connected", cached: true }]);
		vi.mocked(getAllMetadata).mockReturnValue(new Map([["s1", []]]));
		expect(buildServerStatuses()).toEqual([{ name: "s1", status: "not connected", cached: true }]);
	});
	it("buildCallDeps handles connection lookups and consent", async () => {
		vi.mocked(getConfig).mockReturnValue(null); const noop = vi.fn(); await buildCallDeps(noop).connectServer("s1"); expect(noop).not.toHaveBeenCalled();
		vi.mocked(getConfig).mockReturnValue({ mcpServers: { s1: { command: "n" } } }); const call = vi.fn().mockResolvedValue(undefined); await buildCallDeps(call).connectServer("s1"); expect(call).toHaveBeenCalled();
		vi.mocked(getConfig).mockReturnValue({ mcpServers: {} }); await buildCallDeps(call).connectServer("x");
		const c = { name: "s1", client: {}, transport: {}, status: "connected", lastUsedAt: 0, inFlight: 0 };
		vi.mocked(getConnections).mockReturnValue(new Map([["s1", c]])); expect(await buildCallDeps(vi.fn()).getOrConnect("s1")).toBe(c);
		vi.mocked(getConnections).mockReturnValue(new Map()); await expect(buildCallDeps(vi.fn()).getOrConnect("s1")).rejects.toThrow("not connected");
		expect(await buildCallDeps(vi.fn()).checkConsent("s1")).toBe(true);
		const { createConsentManager } = await import("../src/consent.js");
		expect(createConsentManager).toHaveBeenCalledWith("never");
		const mgr = { needsConsent: vi.fn().mockReturnValue(true), recordApproval: vi.fn() };
		vi.mocked(createConsentManager).mockReturnValue(mgr as ReturnType<typeof createConsentManager>);
		vi.mocked(getConfig).mockReturnValue({ mcpServers: {}, settings: { consent: "always" } });
		await buildCallDeps(vi.fn()).checkConsent("s1");
		expect(createConsentManager).toHaveBeenCalledWith("always");
		expect(mgr.recordApproval).toHaveBeenCalledWith("s1");
	});
});
