import { describe, it, expect, vi } from "vitest";
import { fetchContent } from "../src/fetch.js";

function mockResponse(body: string, headers: Record<string, string> = {}, ok = true, status = 200) {
	return {
		ok,
		status,
		statusText: ok ? "OK" : "Error",
		headers: { get: (k: string) => headers[k.toLowerCase()] ?? null },
		text: async () => body,
	// @ts-expect-error minimal mock satisfies fetchContent's usage
	};
}

const articleHtml = `<html><head><title>Test</title></head><body><article>
<h1>Title</h1><p>Content paragraph with enough text for readability.
Multiple sentences needed for proper extraction by the algorithm.
This is a third sentence to ensure we meet the threshold.</p>
</article></body></html>`;

describe("fetchContent", () => {
	it("extracts markdown from HTML response", async () => {
		const mockFetch = vi.fn().mockResolvedValue(
			mockResponse(articleHtml, { "content-type": "text/html" }),
		);
		const result = await fetchContent("https://example.com", mockFetch);
		expect(result.error).toBeNull();
		expect(result.content).toContain("Content paragraph");
		expect(result.title).toBe("Test");
	});
	it("returns plain text for non-HTML", async () => {
		const mockFetch = vi.fn().mockResolvedValue(
			mockResponse("plain text body", { "content-type": "text/plain" }),
		);
		const result = await fetchContent("https://example.com/file.txt", mockFetch);
		expect(result.error).toBeNull();
		expect(result.content).toBe("plain text body");
	});
	it("returns error for binary content", async () => {
		const mockFetch = vi.fn().mockResolvedValue(
			mockResponse("", { "content-type": "image/png" }),
		);
		const result = await fetchContent("https://example.com/img.png", mockFetch);
		expect(result.error).toContain("Unsupported");
	});
	it("returns error for HTTP failure", async () => {
		const mockFetch = vi.fn().mockResolvedValue(mockResponse("", {}, false, 404));
		const result = await fetchContent("https://example.com/missing", mockFetch);
		expect(result.error).toContain("404");
	});
	it("returns error for oversized response", async () => {
		const mockFetch = vi.fn().mockResolvedValue(
			mockResponse("", { "content-type": "text/html", "content-length": "10000000" }),
		);
		const result = await fetchContent("https://example.com", mockFetch);
		expect(result.error).toContain("too large");
	});
	it("returns error when readability fails", async () => {
		const mockFetch = vi.fn().mockResolvedValue(
			mockResponse("<html><body></body></html>", { "content-type": "text/html" }),
		);
		const result = await fetchContent("https://example.com", mockFetch);
		expect(result.error).toContain("Could not extract");
	});
	it("returns plain text when content-type is absent", async () => {
		const mockFetch = vi.fn().mockResolvedValue(mockResponse("raw content"));
		const result = await fetchContent("https://example.com/data", mockFetch);
		expect(result.error).toBeNull();
		expect(result.content).toBe("raw content");
	});
});
