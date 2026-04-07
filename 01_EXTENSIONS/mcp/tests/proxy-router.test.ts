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
	it("routes call with object args", async () => {
		const result = await routeAction({ action: "call", tool: "t", args: { q: "hi" } }, deps);
		expect(deps.call).toHaveBeenCalledWith("t", { q: "hi" });
		expect(result.content[0].text).toBe("called");
	});
	it("routes call with JSON string args", async () => {
		await routeAction({ action: "call", tool: "t", args: '{"jql":"x"}' }, deps);
		expect(deps.call).toHaveBeenCalledWith("t", { jql: "x" });
	});
	it("routes call with undefined args", async () => {
		await routeAction({ action: "call", tool: "t" }, deps);
		expect(deps.call).toHaveBeenCalledWith("t", undefined);
	});
	it("routes call with invalid JSON string args", async () => {
		await routeAction({ action: "call", tool: "t", args: "{bad" }, deps);
		expect(deps.call).toHaveBeenCalledWith("t", undefined);
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

