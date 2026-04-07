import { describe, expect, it, vi } from "vitest";
import { createProxyTool } from "../src/proxy-router.js";

const stubDeps = (overrides = {}) => ({
	search: vi.fn(() => ({ content: [{ type: "text", text: "found" }] })),
	list: vi.fn(() => ({ content: [{ type: "text", text: "listed" }] })),
	describe: vi.fn(() => ({ content: [{ type: "text", text: "described" }] })),
	status: vi.fn(() => ({ content: [{ type: "text", text: "status" }] })),
	call: vi.fn(async () => ({ content: [{ type: "text", text: "called" }] })),
	connect: vi.fn(async () => ({ content: [{ type: "text", text: "connected" }] })),
	...overrides,
});

describe("createProxyTool", () => {
	const pi = { sendMessage: vi.fn() };
	it("returns tool definition with correct name, label, and promptSnippet", () => {
		const tool = createProxyTool(pi, () => "MCP proxy", () => stubDeps());
		expect(tool.name).toBe("mcp");
		expect(tool.label).toBe("MCP");
		expect(tool.promptSnippet).toContain("MCP gateway");
		expect(tool.parameters).toBeDefined();
		expect(tool.parameters).toHaveProperty("properties");
	});
	it("execute delegates to routeAction with makeDeps", async () => {
		const statusFn = vi.fn(() => ({ content: [{ type: "text" as const, text: "ok" }] }));
		const tool = createProxyTool(pi, () => "desc", () => stubDeps({ status: statusFn }));
		const result = await tool.execute("id", { action: "status" }, null, null, null);
		expect(statusFn).toHaveBeenCalled();
		expect(result.content[0].text).toBe("ok");
	});
	it("uses fallback description always", () => {
		const tool = createProxyTool(pi, () => "custom desc");
		expect(tool.description).toContain("MCP proxy");
	});
	it("includes dynamic description in execute details", async () => {
		const tool = createProxyTool(pi, () => "dynamic state info", () => stubDeps());
		const result = await tool.execute("id", { action: "status" }, null, null, null);
		expect(result.details?.description).toBe("dynamic state info");
	});
	it("omits description in details when buildDesc not provided", async () => {
		const tool = createProxyTool(pi);
		const result = await tool.execute("id", { action: "status" }, null, null, null);
		expect(result.details?.description).toBeUndefined();
	});
	it("uses EMPTY_DEPS when makeDeps omitted", async () => {
		const tool = createProxyTool(pi);
		const result = await tool.execute("id", { action: "status" }, null, null, null);
		expect(result.content[0].text).toBe("No servers.");
	});
	it("uses async EMPTY_DEPS for call action when makeDeps omitted", async () => {
		const tool = createProxyTool(pi);
		const result = await tool.execute("id", { action: "call", tool: "t" }, null, null, null);
		expect(result.content[0].text).toBe("No servers.");
	});
});
