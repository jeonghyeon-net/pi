import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../src/tool-direct.js", () => ({ resolveDirectTools: vi.fn().mockReturnValue([]) }));
vi.mock("../src/tool-direct-register.js", () => ({
	createExecutor: vi.fn().mockReturnValue(vi.fn()),
	createDirectToolDef: vi.fn().mockReturnValue({ name: "t1", label: "t1", description: "d", parameters: {}, execute: vi.fn() }),
}));
vi.mock("../src/tool-resource.js", () => ({ buildResourceToolSpecs: vi.fn().mockReturnValue([]) }));
vi.mock("../src/tool-metadata.js", () => ({
	buildToolMetadata: vi.fn().mockResolvedValue([{ name: "t1", originalName: "t1", serverName: "s1", description: "" }]),
}));
vi.mock("../src/state.js", () => ({ getConnections: vi.fn().mockReturnValue(new Map()) }));

import { wireBuildMetadata, wireResolveDirectTools, wireRegisterDirectTools, wireBuildResourceTools, wireDeduplicateTools } from "../src/wire-init-tools.js";
import { resolveDirectTools } from "../src/tool-direct.js";
import { createExecutor } from "../src/tool-direct-register.js";

const tool = { name: "t1", originalName: "t1", serverName: "s1", description: "" };
const spec = { serverName: "s1", originalName: "t1", prefixedName: "s1_t1", description: "d" };

describe("wireBuildMetadata", () => {
	it("builds metadata", async () => { expect(await wireBuildMetadata()("s1", {})).toHaveLength(1); });
});

describe("wireResolveDirectTools", () => {
	beforeEach(() => vi.clearAllMocks());
	const meta = new Map([["s1", [tool]]]);
	it("resolves with directTools true", () => { wireResolveDirectTools()(meta, { mcpServers: { s1: { directTools: true } } }); expect(resolveDirectTools).toHaveBeenCalled(); });
	it("skips directTools false", () => { expect(wireResolveDirectTools()(meta, { mcpServers: { s1: { directTools: false } } })).toEqual([]); });
	it("uses settings.directTools", () => { wireResolveDirectTools()(meta, { mcpServers: { s1: {} }, settings: { directTools: true } }); expect(resolveDirectTools).toHaveBeenCalled(); });
	it("defaults to false", () => { expect(wireResolveDirectTools()(meta, { mcpServers: { s1: {} } })).toEqual([]); });
	it("uses toolPrefix none", () => {
		wireResolveDirectTools()(meta, { mcpServers: { s1: { directTools: true } }, settings: { toolPrefix: "none" } });
		expect(resolveDirectTools).toHaveBeenCalledWith(expect.anything(), true, "none", expect.anything(), expect.anything());
	});
	it("warn function is callable", () => {
		wireResolveDirectTools()(meta, { mcpServers: { s1: { directTools: true } } });
		const w = vi.mocked(resolveDirectTools).mock.calls[0][4];
		expect(() => w("x")).not.toThrow();
	});
});

describe("wireRegisterDirectTools", () => {
	beforeEach(() => vi.clearAllMocks());
	it("registers tools on pi", () => {
		const pi = { registerTool: vi.fn() };
		wireRegisterDirectTools()(pi, [spec], {} as ReturnType<typeof wireRegisterDirectTools> extends (...a: infer P) => void ? P[2] : never);
		expect(pi.registerTool).toHaveBeenCalledWith(expect.objectContaining({ name: "s1_t1" }));
	});
	it("uses inputSchema from spec", () => {
		const pi = { registerTool: vi.fn() };
		const s2 = { ...spec, inputSchema: { type: "object", properties: { a: {} } } };
		wireRegisterDirectTools()(pi, [s2], {} as ReturnType<typeof wireRegisterDirectTools> extends (...a: infer P) => void ? P[2] : never);
		expect(pi.registerTool).toHaveBeenCalledWith(expect.objectContaining({ parameters: s2.inputSchema }));
	});
	it("passes getConn and consent to createExecutor", async () => {
		const pi = { registerTool: vi.fn() };
		wireRegisterDirectTools()(pi, [spec], {} as ReturnType<typeof wireRegisterDirectTools> extends (...a: infer P) => void ? P[2] : never);
		const [, getConn, consent] = vi.mocked(createExecutor).mock.calls[0];
		expect(getConn("s1")).toBeUndefined();
		await expect(consent("s1")).resolves.toBe(true);
	});
});

describe("wireBuildResourceTools", () => {
	it("returns empty", () => { expect(wireBuildResourceTools()("s1", {})).toEqual([]); });
});

describe("wireDeduplicateTools", () => {
	it("deduplicates", () => {
		const tools = [spec, { ...spec, serverName: "s2" }, { ...spec, prefixedName: "s1_t2", description: "d3" }];
		expect(wireDeduplicateTools()(tools)).toHaveLength(2);
	});
	it("empty input", () => { expect(wireDeduplicateTools()([])).toEqual([]); });
});
