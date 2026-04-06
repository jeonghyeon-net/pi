import { describe, expect, it, vi } from "vitest";
import { createProxyTool, routeAction } from "../src/proxy-router.js";
import type { ProxyParams } from "../src/types-proxy.js";

const stubDeps = (overrides = {}) => ({
	search: vi.fn(() => ({ content: [{ type: "text", text: "found" }] })),
	list: vi.fn(() => ({ content: [{ type: "text", text: "listed" }] })),
	describe: vi.fn(() => ({ content: [{ type: "text", text: "described" }] })),
	status: vi.fn(() => ({ content: [{ type: "text", text: "status" }] })),
	call: vi.fn(async () => ({ content: [{ type: "text", text: "called" }] })),
	connect: vi.fn(async () => ({ content: [{ type: "text", text: "connected" }] })),
	...overrides,
});

describe("routeAction", () => {
	const deps = stubDeps();

	it("routes search action", async () => {
		const result = await routeAction({ action: "search", query: "test" }, deps);
		expect(deps.search).toHaveBeenCalledWith("test");
		expect(result.content[0].text).toBe("found");
	});

	it("routes list action", async () => {
		const result = await routeAction({ action: "list", server: "gh" }, deps);
		expect(deps.list).toHaveBeenCalledWith("gh");
		expect(result.content[0].text).toBe("listed");
	});

	it("routes describe action", async () => {
		const result = await routeAction({ action: "describe", tool: "search" }, deps);
		expect(deps.describe).toHaveBeenCalledWith("search");
		expect(result.content[0].text).toBe("described");
	});

	it("routes status action", async () => {
		await routeAction({ action: "status" }, deps);
		expect(deps.status).toHaveBeenCalled();
	});

	it("routes call action", async () => {
		const params: ProxyParams = { action: "call", tool: "search", args: { q: "hi" } };
		const result = await routeAction(params, deps);
		expect(deps.call).toHaveBeenCalledWith("search", { q: "hi" });
		expect(result.content[0].text).toBe("called");
	});

	it("routes connect action", async () => {
		await routeAction({ action: "connect", server: "gh" }, deps);
		expect(deps.connect).toHaveBeenCalledWith("gh");
	});

	it("returns error for missing tool on call", async () => {
		const result = await routeAction({ action: "call" }, deps);
		expect(result.content[0].text).toContain("required");
	});
});

describe("createProxyTool", () => {
	const pi = { sendMessage: vi.fn() };

	it("returns tool definition with correct name and schema", () => {
		const tool = createProxyTool(pi, () => "MCP proxy", () => stubDeps());
		expect(tool.name).toBe("mcp");
		expect(tool.label).toBe("MCP");
		expect(tool.parameters).toBeDefined();
		expect(tool.parameters).toHaveProperty("properties");
	});

	it("execute delegates to routeAction with makeDeps", async () => {
		const statusFn = vi.fn(() => ({ content: [{ type: "text", text: "ok" }] }));
		const tool = createProxyTool(pi, () => "desc", () => stubDeps({ status: statusFn }));
		const result = await tool.execute("id", { action: "status" }, null, null, null);
		expect(statusFn).toHaveBeenCalled();
		expect(result.content[0].text).toBe("ok");
	});
});
