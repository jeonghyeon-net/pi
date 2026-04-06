import { describe, it, expect, vi } from "vitest";
import { parseMcpResults, buildAnswer, mapResults, webSearch } from "../src/search.js";

const sampleText = [
	"Title: Example",
	"URL: https://example.com",
	"Text: Some content here",
	"---",
	"Title: Other",
	"URL: https://other.com",
	"Text: Other content",
].join("\n");

describe("parseMcpResults", () => {
	it("parses title/url/content blocks", () => {
		const results = parseMcpResults(sampleText);
		expect(results).toHaveLength(2);
		expect(results[0]).toEqual({ title: "Example", url: "https://example.com", content: "Some content here\n---" });
		expect(results[1].url).toBe("https://other.com");
	});
	it("skips blocks without URL", () => {
		expect(parseMcpResults("Title: No URL\nText: content")).toHaveLength(0);
	});
	it("returns empty for empty input", () => {
		expect(parseMcpResults("")).toHaveLength(0);
	});
	it("handles missing Text field", () => {
		const results = parseMcpResults("Title: T\nURL: https://a.com\n");
		expect(results[0].content).toBe("");
	});
	it("handles missing Title field", () => {
		const results = parseMcpResults("URL: https://a.com\nText: content");
		expect(results[0].title).toBe("");
	});
});

describe("buildAnswer", () => {
	it("builds answer from results", () => {
		const results = parseMcpResults(sampleText);
		const answer = buildAnswer(results);
		expect(answer).toContain("Some content");
		expect(answer).toContain("Source: Example");
	});
	it("returns empty for empty results", () => {
		expect(buildAnswer([])).toBe("");
	});
	it("skips results with empty content", () => {
		expect(buildAnswer([{ title: "T", url: "https://a.com", content: "" }])).toBe("");
	});
	it("uses fallback title when empty", () => {
		const answer = buildAnswer([{ title: "", url: "https://a.com", content: "some content" }]);
		expect(answer).toContain("Source 1");
	});
});

describe("mapResults", () => {
	it("maps to SearchResult array", () => {
		const mapped = mapResults(parseMcpResults(sampleText));
		expect(mapped[0].title).toBe("Example");
		expect(mapped[0].url).toBe("https://example.com");
		expect(mapped[0].snippet.length).toBeGreaterThan(0);
	});
	it("uses fallback title", () => {
		const mapped = mapResults([{ title: "", url: "https://a.com", content: "c" }]);
		expect(mapped[0].title).toBe("Source 1");
	});
});

describe("webSearch", () => {
	it("calls Exa MCP and returns parsed results", async () => {
		const mockFetch = vi.fn().mockResolvedValue({
			ok: true,
			text: async () => JSON.stringify({
				result: { content: [{ type: "text", text: sampleText }] },
			}),
		});
		const { answer, results } = await webSearch("test", 5, mockFetch);
		expect(answer).toContain("Source:");
		expect(results).toHaveLength(2);
	});
});
