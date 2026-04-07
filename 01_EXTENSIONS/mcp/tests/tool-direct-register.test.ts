import { describe, expect, it, vi } from "vitest";
import {
	createDirectToolDef, createExecutor,
} from "../src/tool-direct-register.js";
import type { DirectToolSpec } from "../src/types-tool.js";

const spec: DirectToolSpec = {
	serverName: "srv", originalName: "search",
	prefixedName: "srv_search", description: "Search tool",
	inputSchema: { type: "object", properties: { q: { type: "string" } } },
};

describe("createDirectToolDef", () => {
	it("creates ToolDef with correct name and description", () => {
		const executor = vi.fn();
		const def = createDirectToolDef(spec, executor);
		expect(def.name).toBe("srv_search");
		expect(def.label).toBe("srv_search");
		expect(def.description).toBe("Search tool");
		expect(def.parameters).toEqual(spec.inputSchema);
	});
	it("uses empty object for missing inputSchema", () => {
		const noSchema: DirectToolSpec = { ...spec, inputSchema: undefined };
		const def = createDirectToolDef(noSchema, vi.fn());
		expect(def.parameters).toEqual({
			type: "object", properties: {},
		});
	});
});

describe("createExecutor", () => {
	it("calls client.callTool for regular tools", async () => {
		const content = [{ type: "text", text: "result" }];
		const client = {
			callTool: vi.fn().mockResolvedValue({ content }),
			readResource: vi.fn(), listTools: vi.fn(),
			listResources: vi.fn(), ping: vi.fn(), close: vi.fn(),
		};
		const getConn = vi.fn().mockReturnValue({
			name: "srv", client, transport: { close: vi.fn() },
			status: "connected", lastUsedAt: 0, inFlight: 0,
		});
		const consent = vi.fn().mockResolvedValue(true);
		const exec = createExecutor(spec, getConn, consent);
		const result = await exec("id1", { q: "test" }, undefined, vi.fn(), {});
		expect(client.callTool).toHaveBeenCalledWith({
			name: "search", arguments: { q: "test" },
		});
		expect(result.content[0].text).toBe("result");
	});
	it("calls client.readResource for resource tools", async () => {
		const resSpec: DirectToolSpec = {
			...spec, resourceUri: "file:///doc",
		};
		const client = {
			callTool: vi.fn(),
			readResource: vi.fn().mockResolvedValue({
				contents: [{ uri: "file:///doc", text: "doc content" }],
			}),
			listTools: vi.fn(), listResources: vi.fn(),
			ping: vi.fn(), close: vi.fn(),
		};
		const getConn = vi.fn().mockReturnValue({
			name: "srv", client, transport: { close: vi.fn() },
			status: "connected", lastUsedAt: 0, inFlight: 0,
		});
		const consent = vi.fn().mockResolvedValue(true);
		const exec = createExecutor(resSpec, getConn, consent);
		const result = await exec("id2", {}, undefined, vi.fn(), {});
		expect(client.readResource).toHaveBeenCalledWith({ uri: "file:///doc" });
		expect(result.content[0].text).toContain("doc content");
	});
	it("throws when consent denied", async () => {
		const getConn = vi.fn().mockReturnValue({
			name: "srv", client: { callTool: vi.fn() },
			transport: { close: vi.fn() },
			status: "connected", lastUsedAt: 0, inFlight: 0,
		});
		const consent = vi.fn().mockResolvedValue(false);
		const exec = createExecutor(spec, getConn, consent);
		await expect(exec("id", {}, undefined, vi.fn(), {})).rejects.toThrow(
			"consent",
		);
	});
	it("throws when connection not found", async () => {
		const getConn = vi.fn().mockReturnValue(undefined);
		const consent = vi.fn().mockResolvedValue(true);
		const exec = createExecutor(spec, getConn, consent);
		await expect(exec("id", {}, undefined, vi.fn(), {})).rejects.toThrow(
			"not connected",
		);
	});
});
