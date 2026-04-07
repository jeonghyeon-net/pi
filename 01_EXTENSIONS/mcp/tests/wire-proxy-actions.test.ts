import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../src/proxy-search.js", () => ({ proxySearch: vi.fn().mockReturnValue({ content: [{ type: "text", text: "found" }] }) }));
vi.mock("../src/proxy-query.js", () => ({ proxyList: vi.fn().mockReturnValue({ content: [{ type: "text", text: "list" }] }), proxyDescribe: vi.fn().mockReturnValue({ content: [{ type: "text", text: "desc" }] }), proxyStatus: vi.fn().mockReturnValue({ content: [{ type: "text", text: "status" }] }) }));
vi.mock("../src/proxy-call.js", () => ({ proxyCall: vi.fn().mockResolvedValue({ content: [{ type: "text", text: "called" }] }) }));
vi.mock("../src/search.js", () => ({ matchTool: vi.fn() }));
vi.mock("../src/schema-format.js", () => ({ formatSchema: vi.fn().mockReturnValue("schema") }));
vi.mock("../src/state.js", () => ({ getAllMetadata: vi.fn().mockReturnValue(new Map()), getMetadata: vi.fn().mockReturnValue(undefined), getConfig: vi.fn().mockReturnValue({ mcpServers: { s1: { command: "node" } } }), getConnections: vi.fn().mockReturnValue(new Map()) }));
vi.mock("../src/failure-tracker.js", () => ({ getBackoffMs: vi.fn().mockReturnValue(0), getFailure: vi.fn().mockReturnValue(undefined) }));
vi.mock("../src/wire-command.js", () => ({ wireCommandConnect: vi.fn().mockReturnValue(vi.fn().mockResolvedValue(undefined)) }));
vi.mock("../src/proxy-description.js", () => ({ buildDescription: vi.fn().mockReturnValue("MCP proxy tool.") }));
vi.mock("../src/consent.js", () => ({ createConsentManager: vi.fn().mockReturnValue({ needsConsent: vi.fn().mockReturnValue(false), recordApproval: vi.fn() }) }));

import { buildProxyDescription, wireProxyDeps } from "../src/wire-proxy.js";
import { getConfig } from "../src/state.js";

describe("wireProxyDeps actions", () => {
	beforeEach(() => vi.clearAllMocks());
	it("provides all actions", () => { const d = wireProxyDeps(); ["search", "list", "describe", "status", "call", "connect"].forEach((k) => expect(typeof d[k as keyof typeof d]).toBe("function")); });
	it("routes proxy actions", async () => {
		const deps = wireProxyDeps();
		expect(deps.search("q").content[0].text).toBe("found");
		expect(deps.search(undefined).content[0].text).toBe("found");
		expect(deps.list("s1").content[0].text).toBe("list");
		expect(deps.describe("t1").content[0].text).toBe("desc");
		expect(deps.status().content[0].text).toBe("status");
		expect((await deps.call("t1")).content[0].text).toBe("called");
	});
	it("handles connect cases", async () => {
		const deps = wireProxyDeps();
		expect((await deps.connect("s1")).content[0].text).toContain("Connected");
		expect((await deps.connect(undefined)).content[0].text).toContain("required");
		expect((await deps.connect("x")).content[0].text).toContain("not found");
		vi.mocked(getConfig).mockReturnValue(null);
		expect((await deps.connect("s1")).content[0].text).toContain("No config");
	});
});

describe("buildProxyDescription", () => {
	it("returns description string and passes state accessors", async () => {
		expect(buildProxyDescription()).toBe("MCP proxy tool.");
		const { buildDescription } = await import("../src/proxy-description.js");
		const state = vi.mocked(buildDescription).mock.calls[0][0];
		expect(state.getServers()).toEqual(expect.any(Array));
		expect(state.getMetadataMap()).toBeInstanceOf(Map);
	});
});
