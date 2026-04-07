import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../src/tool-direct.js", () => ({ resolveDirectTools: vi.fn().mockReturnValue([]) }));
vi.mock("../src/tool-direct-register.js", () => ({
	createExecutor: vi.fn().mockReturnValue(vi.fn()),
	createDirectToolDef: vi.fn().mockReturnValue({ name: "t1", label: "t1", description: "d", parameters: {}, execute: vi.fn() }),
}));
vi.mock("../src/tool-resource.js", () => ({ buildResourceToolSpecs: vi.fn().mockReturnValue([]) }));
vi.mock("../src/tool-metadata.js", () => ({
	buildToolMetadata: vi.fn().mockResolvedValue([{ name: "t1", originalName: "t1", serverName: "s1", description: "" }]),
	buildResourceMetadata: vi.fn().mockResolvedValue([{ name: "r1", originalName: "r1", serverName: "s1", description: "", resourceUri: "file:///r" }]),
}));
vi.mock("../src/state.js", () => ({ getConnections: vi.fn().mockReturnValue(new Map()), getConfig: vi.fn().mockReturnValue(null) }));
vi.mock("../src/consent.js", () => ({ createConsentManager: vi.fn().mockReturnValue({ needsConsent: vi.fn().mockReturnValue(false), recordApproval: vi.fn() }) }));

import { wireBuildMetadata, wireResolveDirectTools, wireRegisterDirectTools, wireBuildResourceTools, wireDeduplicateTools } from "../src/wire-init-tools.js";
import { resolveDirectTools } from "../src/tool-direct.js";
import { createExecutor } from "../src/tool-direct-register.js";

const tool = { name: "t1", originalName: "t1", serverName: "s1", description: "" };
const spec = { serverName: "s1", originalName: "t1", prefixedName: "s1_t1", description: "d" };
type Deps3 = ReturnType<typeof wireRegisterDirectTools> extends (...a: infer P) => void ? P[2] : never;

describe("wireBuildMetadata", () => {
	it("builds with valid client", async () => { expect(await wireBuildMetadata()("s1", { listTools: vi.fn(), callTool: vi.fn() })).toHaveLength(1); });
	it("returns empty for non-McpClient", async () => { expect(await wireBuildMetadata()("s1", {})).toEqual([]); });
});

describe("wireResolveDirectTools", () => {
	beforeEach(() => vi.clearAllMocks());
	const meta = new Map([["s1", [tool]]]);
	it("resolves with directTools true", () => { wireResolveDirectTools()(meta, { mcpServers: { s1: { directTools: true } } }); expect(resolveDirectTools).toHaveBeenCalled(); });
	it("skips directTools false", () => { expect(wireResolveDirectTools()(meta, { mcpServers: { s1: { directTools: false } } })).toEqual([]); });
	it("uses settings.directTools", () => { wireResolveDirectTools()(meta, { mcpServers: { s1: {} }, settings: { directTools: true } }); expect(resolveDirectTools).toHaveBeenCalled(); });
	it("defaults to false", () => { expect(wireResolveDirectTools()(meta, { mcpServers: { s1: {} } })).toEqual([]); });
	it("uses toolPrefix none", () => { wireResolveDirectTools()(meta, { mcpServers: { s1: { directTools: true } }, settings: { toolPrefix: "none" } }); expect(resolveDirectTools).toHaveBeenCalledWith(expect.anything(), true, "none", expect.anything(), expect.anything()); });
	it("warn callable", () => { wireResolveDirectTools()(meta, { mcpServers: { s1: { directTools: true } } }); expect(() => vi.mocked(resolveDirectTools).mock.calls[0][4]("x")).not.toThrow(); });
});

describe("wireRegisterDirectTools", () => {
	beforeEach(() => vi.clearAllMocks());
	it("registers tools on pi", () => { const pi = { registerTool: vi.fn() }; wireRegisterDirectTools()(pi, [spec], {} as Deps3); expect(pi.registerTool).toHaveBeenCalledWith(expect.objectContaining({ name: "s1_t1" })); });
	it("uses inputSchema from spec", () => { const pi = { registerTool: vi.fn() }; wireRegisterDirectTools()(pi, [{ ...spec, inputSchema: { type: "object", properties: { a: {} } } }], {} as Deps3); expect(pi.registerTool).toHaveBeenCalledWith(expect.objectContaining({ parameters: { type: "object", properties: { a: {} } } })); });
	it("passes getConn and consent", async () => { const pi = { registerTool: vi.fn() }; wireRegisterDirectTools()(pi, [spec], {} as Deps3); const [, g, c] = vi.mocked(createExecutor).mock.calls[0]; expect(g("s1")).toBeUndefined(); await expect(c("s1")).resolves.toBe(true); });
	it("consent records approval when needsConsent true", async () => {
		const { createConsentManager } = await import("../src/consent.js");
		const mgr = { needsConsent: vi.fn().mockReturnValue(true), recordApproval: vi.fn() };
		vi.mocked(createConsentManager).mockReturnValue(mgr as ReturnType<typeof createConsentManager>);
		const pi = { registerTool: vi.fn() }; wireRegisterDirectTools()(pi, [spec], {} as Deps3);
		await vi.mocked(createExecutor).mock.calls[0][2]("s1"); expect(mgr.recordApproval).toHaveBeenCalledWith("s1");
	});
	it("reads consent mode from config", async () => {
		const { getConfig } = await import("../src/state.js"); vi.mocked(getConfig).mockReturnValue({ mcpServers: {}, settings: { consent: "always" } });
		const { createConsentManager } = await import("../src/consent.js"); const pi = { registerTool: vi.fn() };
		wireRegisterDirectTools()(pi, [spec], {} as Deps3); expect(createConsentManager).toHaveBeenCalledWith("always");
	});
});

describe("wireBuildResourceTools", () => {
	it("builds with valid client", async () => { expect(await wireBuildResourceTools()("s1", { listTools: vi.fn(), callTool: vi.fn() })).toHaveLength(1); });
	it("returns empty for non-McpClient", async () => { expect(await wireBuildResourceTools()("s1", {})).toEqual([]); });
});

describe("wireDeduplicateTools", () => {
	it("deduplicates", () => { expect(wireDeduplicateTools()([spec, { ...spec, serverName: "s2" }, { ...spec, prefixedName: "s1_t2", description: "d3" }])).toHaveLength(2); });
	it("empty input", () => { expect(wireDeduplicateTools()([])).toEqual([]); });
});
