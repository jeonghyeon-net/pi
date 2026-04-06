import { describe, expect, it } from "vitest";
import { parseFrontmatter } from "../src/frontmatter.js";

describe("parseFrontmatter", () => {
	it("returns empty meta and trimmed body for no frontmatter", () => {
		expect(parseFrontmatter("hello world")).toEqual({
			meta: {},
			body: "hello world",
		});
	});

	it("parses valid frontmatter with body", () => {
		const input = "---\ntitle: Hello\ntags: foo\n---\nBody text";
		expect(parseFrontmatter(input)).toEqual({
			meta: { title: "Hello", tags: "foo" },
			body: "Body text",
		});
	});

	it("parses frontmatter without body", () => {
		const input = "---\nkey: value\n---";
		expect(parseFrontmatter(input)).toEqual({
			meta: { key: "value" },
			body: "",
		});
	});

	it("strips BOM character", () => {
		const input = "\uFEFF---\nkey: val\n---\ntext";
		expect(parseFrontmatter(input)).toEqual({
			meta: { key: "val" },
			body: "text",
		});
	});

	it("skips lines without colon in frontmatter", () => {
		const input = "---\nnoColonLine\nkey: val\n---\nbody";
		expect(parseFrontmatter(input)).toEqual({
			meta: { key: "val" },
			body: "body",
		});
	});

	it("skips entries with empty key", () => {
		const input = "---\n: emptykey\nreal: data\n---\nbody";
		expect(parseFrontmatter(input)).toEqual({
			meta: { real: "data" },
			body: "body",
		});
	});

	it("skips entries with empty value", () => {
		const input = "---\nemptyval:\nreal: data\n---\nbody";
		expect(parseFrontmatter(input)).toEqual({
			meta: { real: "data" },
			body: "body",
		});
	});

	it("handles \\r\\n line endings", () => {
		const input = "---\r\nkey: val\r\n---\r\nbody";
		expect(parseFrontmatter(input)).toEqual({
			meta: { key: "val" },
			body: "body",
		});
	});

	it("handles value containing colons", () => {
		const input = "---\nurl: http://example.com\n---\nbody";
		expect(parseFrontmatter(input)).toEqual({
			meta: { url: "http://example.com" },
			body: "body",
		});
	});

	it("trims keys and values", () => {
		const input = "---\n  key  :  value  \n---\nbody";
		expect(parseFrontmatter(input)).toEqual({
			meta: { key: "value" },
			body: "body",
		});
	});
});
