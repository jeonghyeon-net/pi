import { describe, it, expect } from "vitest";
import { extractText } from "../src/exa-mcp.js";

describe("extractText", () => {
	it("extracts text from result", () => {
		expect(extractText({ result: { content: [{ type: "text", text: "hello" }] } })).toBe("hello");
	});
	it("throws on RPC error", () => {
		expect(() => extractText({ error: { code: 500, message: "fail" } })).toThrow("Exa MCP error 500: fail");
	});
	it("throws on RPC error without code", () => {
		expect(() => extractText({ error: { message: "fail" } })).toThrow("Exa MCP error: fail");
	});
	it("throws on RPC error without message", () => {
		expect(() => extractText({ error: { code: 500 } })).toThrow("Exa MCP error 500: Unknown");
	});
	it("throws on isError result", () => {
		expect(() => extractText({ result: { isError: true, content: [{ type: "text", text: "bad" }] } })).toThrow("bad");
	});
	it("throws on isError with no message", () => {
		expect(() => extractText({ result: { isError: true } })).toThrow("Exa MCP returned an error");
	});
	it("throws on empty content", () => {
		expect(() => extractText({ result: { content: [] } })).toThrow("empty content");
	});
	it("throws on whitespace-only content", () => {
		expect(() => extractText({ result: { content: [{ type: "text", text: "   " }] } })).toThrow("empty content");
	});
});
