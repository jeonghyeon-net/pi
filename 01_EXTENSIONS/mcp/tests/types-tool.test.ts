import { describe, it, expect, vi } from "vitest";
import type {
	ToolMetadata,
	DirectToolSpec,
	ToolDef,
	ToolExecuteFn,
	ToolResult,
} from "../src/types-tool.js";

describe("types-tool", () => {
	it("ToolMetadata has required fields", () => {
		const meta: ToolMetadata = {
			name: "myserver__read",
			originalName: "read",
			serverName: "myserver",
			description: "Read a file",
			inputSchema: { type: "object" },
			resourceUri: "file:///a",
		};
		expect(meta.name).toBe("myserver__read");
		expect(meta.serverName).toBe("myserver");
	});

	it("ToolMetadata works without optional fields", () => {
		const meta: ToolMetadata = {
			name: "s__t",
			originalName: "t",
			serverName: "s",
			description: "desc",
		};
		expect(meta.inputSchema).toBeUndefined();
		expect(meta.resourceUri).toBeUndefined();
	});

	it("DirectToolSpec has all fields", () => {
		const spec: DirectToolSpec = {
			serverName: "server1",
			originalName: "bash",
			prefixedName: "server1__bash",
			description: "Run bash",
			inputSchema: { type: "object", properties: {} },
			resourceUri: "resource://shell",
		};
		expect(spec.prefixedName).toBe("server1__bash");
	});

	it("ToolDef includes execute function", async () => {
		const executeFn: ToolExecuteFn = vi.fn().mockResolvedValue({
			content: [{ type: "text", text: "done" }],
		});
		const def: ToolDef = {
			name: "mcp",
			label: "MCP Proxy",
			description: "Proxy MCP calls",
			promptSnippet: "Use mcp tool to call servers",
			promptGuidelines: ["Always specify server"],
			parameters: { type: "object" },
			execute: executeFn,
		};
		const result = await def.execute("call-1", {}, null, null, null);
		expect(result.content[0].text).toBe("done");
		expect(def.promptGuidelines).toHaveLength(1);
	});

	it("ToolDef works without optional fields", () => {
		const def: ToolDef = {
			name: "mcp",
			label: "MCP",
			description: "desc",
			parameters: {},
			execute: vi.fn().mockResolvedValue({ content: [] }),
		};
		expect(def.promptSnippet).toBeUndefined();
		expect(def.promptGuidelines).toBeUndefined();
	});

	it("ToolResult holds content and optional details", () => {
		const result: ToolResult = {
			content: [
				{ type: "text", text: "output" },
				{ type: "image", data: "base64data", mimeType: "image/png" },
			],
			details: { elapsed: 123 },
		};
		expect(result.content).toHaveLength(2);
		expect(result.details?.elapsed).toBe(123);
	});

	it("ToolResult works without details", () => {
		const result: ToolResult = { content: [] };
		expect(result.details).toBeUndefined();
	});
});
