import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../src/proxy-search.js", () => ({ proxySearch: vi.fn().mockReturnValue({ content: [{ type: "text", text: "found" }] }) }));
vi.mock("../src/proxy-query.js", () => ({
	proxyList: vi.fn().mockReturnValue({ content: [{ type: "text", text: "list" }] }),
	proxyDescribe: vi.fn().mockReturnValue({ content: [{ type: "text", text: "desc" }] }),
	proxyStatus: vi.fn().mockReturnValue({ content: [{ type: "text", text: "status" }] }),
}));
vi.mock("../src/proxy-call.js", () => ({ proxyCall: vi.fn().mockResolvedValue({ content: [{ type: "text", text: "called" }] }) }));
vi.mock("../src/search.js", () => ({ matchTool: vi.fn() }));
vi.mock("../src/schema-format.js", () => ({ formatSchema: vi.fn().mockReturnValue("schema") }));
vi.mock("../src/content-transform.js", () => ({ transformContent: vi.fn().mockReturnValue({ type: "text", text: "t" }) }));
vi.mock("../src/state.js", () => ({
	getAllMetadata: vi.fn().mockReturnValue(new Map()), getMetadata: vi.fn().mockReturnValue(undefined),
	getConfig: vi.fn().mockReturnValue({ mcpServers: { s1: { command: "node" } } }),
	getConnections: vi.fn().mockReturnValue(new Map()),
}));
vi.mock("../src/failure-tracker.js", () => ({ getBackoffMs: vi.fn().mockReturnValue(0), getFailure: vi.fn().mockReturnValue(undefined) }));
vi.mock("../src/wire-command.js", () => ({ wireCommandConnect: vi.fn().mockReturnValue(vi.fn().mockResolvedValue(undefined)) }));

import { wireProxyDeps, findToolInMetadata, buildServerStatuses, buildCallDeps } from "../src/wire-proxy.js";
import { getConfig, getAllMetadata, getConnections } from "../src/state.js";

describe("wireProxyDeps", () => {
	beforeEach(() => vi.clearAllMocks());
	it("has all actions", () => { const d = wireProxyDeps(); ["search", "list", "describe", "status", "call", "connect"].forEach((k) => expect(typeof d[k as keyof typeof d]).toBe("function")); });
	it("search", () => { expect(wireProxyDeps().search("q").content[0].text).toBe("found"); });
	it("search undefined", () => { wireProxyDeps().search(undefined); });
	it("list", () => { expect(wireProxyDeps().list("s1").content[0].text).toBe("list"); });
	it("describe", () => { expect(wireProxyDeps().describe("t1").content[0].text).toBe("desc"); });
	it("status", () => { expect(wireProxyDeps().status().content[0].text).toBe("status"); });
	it("call", async () => { expect((await wireProxyDeps().call("t1")).content[0].text).toBe("called"); });
	it("connect ok", async () => { expect((await wireProxyDeps().connect("s1")).content[0].text).toContain("Connected"); });
	it("connect no server", async () => { expect((await wireProxyDeps().connect(undefined)).content[0].text).toContain("required"); });
	it("connect unknown", async () => { expect((await wireProxyDeps().connect("x")).content[0].text).toContain("not found"); });
	it("connect no config", async () => { vi.mocked(getConfig).mockReturnValue(null); expect((await wireProxyDeps().connect("s1")).content[0].text).toContain("No config"); });
});

describe("findToolInMetadata", () => {
	it("found", () => { const t = { name: "t1", originalName: "t1", serverName: "s1", description: "" }; vi.mocked(getAllMetadata).mockReturnValue(new Map([["s1", [t]]])); expect(findToolInMetadata("t1")).toBe(t); });
	it("not found", () => { vi.mocked(getAllMetadata).mockReturnValue(new Map()); expect(findToolInMetadata("t1")).toBeUndefined(); });
});

describe("buildServerStatuses", () => {
	beforeEach(() => vi.clearAllMocks());
	it("empty when no config", () => { vi.mocked(getConfig).mockReturnValue(null); expect(buildServerStatuses()).toEqual([]); });
	it("returns statuses", () => {
		vi.mocked(getConfig).mockReturnValue({ mcpServers: { s1: { command: "n" } } });
		vi.mocked(getConnections).mockReturnValue(new Map([["s1", { name: "s1", status: "connected" }]]));
		expect(buildServerStatuses()).toEqual([{ name: "s1", status: "connected" }]);
	});
});

describe("buildCallDeps", () => {
	beforeEach(() => vi.clearAllMocks());
	it("connectServer no-ops without config", async () => { vi.mocked(getConfig).mockReturnValue(null); const f = vi.fn(); await buildCallDeps(f).connectServer("s1"); expect(f).not.toHaveBeenCalled(); });
	it("connectServer calls doConnect", async () => { vi.mocked(getConfig).mockReturnValue({ mcpServers: { s1: { command: "n" } } }); const f = vi.fn().mockResolvedValue(undefined); await buildCallDeps(f).connectServer("s1"); expect(f).toHaveBeenCalled(); });
	it("connectServer skips unknown", async () => { vi.mocked(getConfig).mockReturnValue({ mcpServers: {} }); const f = vi.fn(); await buildCallDeps(f).connectServer("x"); expect(f).not.toHaveBeenCalled(); });
	it("getOrConnect returns conn", async () => { const c = { name: "s1", client: {}, transport: {}, status: "connected", lastUsedAt: 0, inFlight: 0 }; vi.mocked(getConnections).mockReturnValue(new Map([["s1", c]])); expect(await buildCallDeps(vi.fn()).getOrConnect("s1")).toBe(c); });
	it("getOrConnect throws", async () => { vi.mocked(getConnections).mockReturnValue(new Map()); await expect(buildCallDeps(vi.fn()).getOrConnect("s1")).rejects.toThrow("not connected"); });
	it("checkConsent true", async () => { expect(await buildCallDeps(vi.fn()).checkConsent("s1")).toBe(true); });
});
