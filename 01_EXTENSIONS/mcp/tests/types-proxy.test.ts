import { describe, it, expect } from "vitest";
import type {
	ProxyAction,
	ProxyParams,
	ProxyToolResult,
	ProxyErrorResult,
} from "../src/types-proxy.js";

describe("types-proxy", () => {
	it("ProxyAction accepts all valid values", () => {
		const actions: ProxyAction[] = [
			"call", "list", "describe", "search", "status", "connect",
		];
		expect(actions).toHaveLength(6);
	});

	it("ProxyParams with call action", () => {
		const params: ProxyParams = {
			action: "call",
			tool: "read",
			args: { path: "/tmp/a.txt" },
			server: "myserver",
		};
		expect(params.action).toBe("call");
		expect(params.tool).toBe("read");
		expect(params.args?.path).toBe("/tmp/a.txt");
	});

	it("ProxyParams with search action", () => {
		const params: ProxyParams = { action: "search", query: "file reader" };
		expect(params.query).toBe("file reader");
		expect(params.tool).toBeUndefined();
	});

	it("ProxyParams with status action (minimal)", () => {
		const params: ProxyParams = { action: "status" };
		expect(params.server).toBeUndefined();
	});

	it("ProxyToolResult has content and optional details", () => {
		const result: ProxyToolResult = {
			content: [{ type: "text", text: "ok" }],
			details: { server: "s1", elapsed: 42 },
		};
		expect(result.content[0].text).toBe("ok");
		expect(result.details?.elapsed).toBe(42);
	});

	it("ProxyToolResult works without details", () => {
		const result: ProxyToolResult = { content: [] };
		expect(result.details).toBeUndefined();
	});

	it("ProxyErrorResult has required fields", () => {
		const err: ProxyErrorResult = {
			code: "SERVER_NOT_FOUND",
			message: "Server 'foo' not configured",
			hint: "Check mcp.json",
			server: "foo",
			tool: "bar",
		};
		expect(err.code).toBe("SERVER_NOT_FOUND");
		expect(err.hint).toBe("Check mcp.json");
	});

	it("ProxyErrorResult works without optional fields", () => {
		const err: ProxyErrorResult = {
			code: "TIMEOUT",
			message: "Request timed out",
		};
		expect(err.hint).toBeUndefined();
		expect(err.server).toBeUndefined();
		expect(err.tool).toBeUndefined();
	});
});
