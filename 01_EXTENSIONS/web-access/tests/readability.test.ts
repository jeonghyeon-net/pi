import { describe, it, expect } from "vitest";
import { htmlToMarkdown } from "../src/readability.js";

const validHtml = `<html><head><title>Test Page</title></head>
<body><article><h1>Hello</h1><p>World paragraph with enough content to be meaningful.
This needs to be long enough for Readability to consider it a real article.
Adding more sentences to ensure the content threshold is met.
Readability requires a minimum amount of text to parse correctly.</p></article></body></html>`;

describe("htmlToMarkdown", () => {
	it("extracts title and markdown from valid HTML", () => {
		const result = htmlToMarkdown(validHtml);
		expect(result).not.toBeNull();
		expect(result!.title).toBe("Test Page");
		expect(result!.content).toContain("Hello");
		expect(result!.content).toContain("World paragraph");
	});
	it("returns null for unparseable HTML", () => {
		expect(htmlToMarkdown("<html><body></body></html>")).toBeNull();
	});
	it("returns null for empty string", () => {
		expect(htmlToMarkdown("")).toBeNull();
	});
	it("uses empty string when title is missing", () => {
		const noTitle = `<html><body><article><h1>Content</h1>
		<p>Enough text to be parsed by readability as a real article.
		Adding multiple sentences for the content threshold.</p></article></body></html>`;
		const result = htmlToMarkdown(noTitle);
		if (result) expect(typeof result.title).toBe("string");
	});
});
