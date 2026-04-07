import { describe, it, expect } from "vitest";
import { transformContent } from "../src/content-transform.js";

describe("transformContent", () => {
	it("transforms text content", () => {
		const result = transformContent({ type: "text", text: "hello" });
		expect(result).toEqual({ type: "text", text: "hello" });
	});

	it("transforms text with missing text field", () => {
		const result = transformContent({ type: "text" });
		expect(result).toEqual({ type: "text", text: "" });
	});

	it("transforms image content", () => {
		const result = transformContent({ type: "image", data: "abc", mimeType: "image/png" });
		expect(result).toEqual({ type: "image", data: "abc", mimeType: "image/png" });
	});

	it("transforms image with missing data and mimeType", () => {
		const result = transformContent({ type: "image" });
		expect(result).toEqual({ type: "image", data: "", mimeType: "application/octet-stream" });
	});

	it("transforms resource content", () => {
		const result = transformContent({
			type: "resource",
			resource: { uri: "file:///a.txt", text: "contents" },
		});
		expect(result.type).toBe("text");
		expect(result.text).toContain("[Resource: file:///a.txt]");
		expect(result.text).toContain("contents");
	});

	it("transforms resource with blob fallback", () => {
		const result = transformContent({
			type: "resource",
			resource: { uri: "file:///b.bin", blob: "blobdata" },
		});
		expect(result.text).toContain("blobdata");
	});

	it("transforms resource with no text or blob", () => {
		const result = transformContent({
			type: "resource",
			resource: { uri: "file:///c.txt" },
		});
		expect(result.text).toBe("[Resource: file:///c.txt]\n");
	});

	it("transforms resource_link content", () => {
		const result = transformContent({ type: "resource_link", name: "Doc", uri: "http://x" });
		expect(result.text).toBe("[Resource Link: Doc (http://x)]");
	});

	it("transforms resource_link with missing name and uri", () => {
		const result = transformContent({ type: "resource_link" });
		expect(result.text).toBe("[Resource Link:  ()]");
	});

	it("transforms audio as descriptive text", () => {
		const result = transformContent({ type: "audio" });
		expect(result.text).toBe("[Audio content not supported in text mode]");
	});

	it("transforms unknown type as JSON", () => {
		const result = transformContent({ type: "custom", text: "data" });
		expect(result.text).toBe(JSON.stringify({ type: "custom", text: "data" }));
	});
});
