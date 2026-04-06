import { describe, it, expect, vi } from "vitest";
import { createFetchContentTool } from "../src/tools.js";

describe("createFetchContentTool", () => {
	it("has correct metadata", () => {
		const tool = createFetchContentTool();
		expect(tool.name).toBe("fetch_content");
		expect(tool.label).toBe("Fetch Content");
	});
	it("returns extracted content", async () => {
		const html = `<html><head><title>Page</title></head><body><article><h1>H</h1>
		<p>Long enough paragraph for readability to work properly with extraction.
		Multiple sentences help ensure proper parsing by the algorithm.</p></article></body></html>`;
		const mockFetch = vi.fn().mockResolvedValue({
			ok: true, status: 200, statusText: "OK",
			headers: { get: (k: string) => k === "content-type" ? "text/html" : null },
			text: async () => html,
		});
		const tool = createFetchContentTool(mockFetch);
		const r = await tool.execute("", { url: "https://example.com" });
		expect(r.content[0].text).toContain("Page");
	});
	it("returns content with url as title for plain text", async () => {
		const mockFetch = vi.fn().mockResolvedValue({
			ok: true, status: 200, statusText: "OK",
			headers: { get: () => null },
			text: async () => "plain content",
		});
		const tool = createFetchContentTool(mockFetch);
		const r = await tool.execute("", { url: "https://example.com/data" });
		expect(r.content[0].text).toContain("plain content");
	});
	it("returns content without title prefix when html title is empty", async () => {
		const html = `<html><body><article><h1>H</h1>
		<p>Long enough paragraph for readability to work properly with extraction.
		Multiple sentences help ensure proper parsing by the algorithm.</p></article></body></html>`;
		const mockFetch = vi.fn().mockResolvedValue({
			ok: true, status: 200, statusText: "OK",
			headers: { get: (k: string) => k === "content-type" ? "text/html" : null },
			text: async () => html,
		});
		const tool = createFetchContentTool(mockFetch);
		const r = await tool.execute("", { url: "https://example.com" });
		expect(r.content[0].text.startsWith("# ")).toBe(false);
	});
	it("returns fetch error message", async () => {
		const mockFetch = vi.fn().mockResolvedValue({
			ok: false, status: 404, statusText: "Not Found",
			headers: { get: () => null },
			text: async () => "",
		});
		const tool = createFetchContentTool(mockFetch);
		const r = await tool.execute("", { url: "https://example.com/missing" });
		expect(r.content[0].text).toContain("Error: HTTP 404");
	});
	it("returns error on failure", async () => {
		const mockFetch = vi.fn().mockRejectedValue(new Error("network"));
		const tool = createFetchContentTool(mockFetch);
		const r = await tool.execute("", { url: "https://fail.com" });
		expect(r.content[0].text).toContain("Error: network");
	});
});
