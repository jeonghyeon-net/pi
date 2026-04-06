import { describe, it, expect, vi } from "vitest";
import { createWebSearchTool, createCodeSearchTool } from "../src/tools.js";

const okFetch = (text: string) =>
	vi.fn().mockResolvedValue({ ok: true, text: async () => text });
const mcpOk = (text: string) =>
	JSON.stringify({ result: { content: [{ type: "text", text }] } });

describe("createWebSearchTool", () => {
	it("has correct metadata", () => {
		const tool = createWebSearchTool();
		expect(tool.name).toBe("web_search");
		expect(tool.label).toBe("Web Search");
		expect(tool.parameters).toBeDefined();
	});
	it("returns search results", async () => {
		const text = "Title: Ex\nURL: https://ex.com\nText: content";
		const tool = createWebSearchTool(okFetch(mcpOk(text)));
		const r = await tool.execute("", { query: "test" });
		expect(r.content[0].text).toContain("Source:");
	});
	it("returns answer only when no sources", async () => {
		const text = "Title: No URL result\nText: some content without a url";
		const tool = createWebSearchTool(okFetch(mcpOk(text)));
		const r = await tool.execute("", { query: "test" });
		expect(r.content[0].text).toBeDefined();
	});
	it("returns error on failure", async () => {
		const tool = createWebSearchTool(vi.fn().mockRejectedValue(new Error("fail")));
		const r = await tool.execute("", { query: "test" });
		expect(r.content[0].text).toContain("Error: fail");
	});
	it("returns error for non-Error thrown value", async () => {
		const tool = createWebSearchTool(vi.fn().mockRejectedValue("string error"));
		const r = await tool.execute("", { query: "test" });
		expect(r.content[0].text).toContain("Error: string error");
	});
});

describe("createCodeSearchTool", () => {
	it("has correct metadata", () => {
		const tool = createCodeSearchTool();
		expect(tool.name).toBe("code_search");
		expect(tool.label).toBe("Code Search");
	});
	it("returns code content", async () => {
		const tool = createCodeSearchTool(okFetch(mcpOk("function main() {}")));
		const r = await tool.execute("", { query: "react" });
		expect(r.content[0].text).toBe("function main() {}");
	});
	it("returns error on failure", async () => {
		const tool = createCodeSearchTool(vi.fn().mockRejectedValue(new Error("boom")));
		const r = await tool.execute("", { query: "q" });
		expect(r.content[0].text).toContain("Error: boom");
	});
});
