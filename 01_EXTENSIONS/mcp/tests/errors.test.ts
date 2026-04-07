import { describe, it, expect } from "vitest";
import { McpError, mcpError } from "../src/errors.js";

describe("McpError", () => {
	it("is instanceof Error", () => {
		const err = new McpError("E_TEST", "boom");
		expect(err).toBeInstanceOf(Error);
	});

	it("has name McpError", () => {
		const err = new McpError("E_TEST", "boom");
		expect(err.name).toBe("McpError");
	});

	it("stores code and message", () => {
		const err = new McpError("E_CONN", "connection failed");
		expect(err.code).toBe("E_CONN");
		expect(err.message).toBe("connection failed");
	});

	it("stores hint from opts", () => {
		const err = new McpError("E_X", "fail", { hint: "try again" });
		expect(err.hint).toBe("try again");
	});

	it("hint is undefined when not provided", () => {
		const err = new McpError("E_X", "fail");
		expect(err.hint).toBeUndefined();
	});

	it("stores context fields from opts", () => {
		const err = new McpError("E_X", "fail", {
			server: "srv1",
			tool: "read",
			uri: "file:///x",
		});
		expect(err.context).toEqual({
			server: "srv1",
			tool: "read",
			uri: "file:///x",
		});
	});

	it("context fields are undefined when not provided", () => {
		const err = new McpError("E_X", "fail");
		expect(err.context).toEqual({
			server: undefined,
			tool: undefined,
			uri: undefined,
		});
	});

	it("preserves cause", () => {
		const cause = new Error("root");
		const err = new McpError("E_X", "fail", { cause });
		expect(err.cause).toBe(cause);
	});

	it("cause is undefined when not provided", () => {
		const err = new McpError("E_X", "fail");
		expect(err.cause).toBeUndefined();
	});

	it("toJSON returns code, message, hint, context", () => {
		const err = new McpError("E_X", "fail", {
			hint: "h",
			server: "s",
			tool: "t",
			uri: "u",
		});
		expect(err.toJSON()).toEqual({
			code: "E_X",
			message: "fail",
			hint: "h",
			context: { server: "s", tool: "t", uri: "u" },
		});
	});
});

describe("mcpError", () => {
	it("returns an McpError instance", () => {
		const err = mcpError("E_F", "factory");
		expect(err).toBeInstanceOf(McpError);
		expect(err.code).toBe("E_F");
		expect(err.message).toBe("factory");
	});

	it("forwards opts to McpError", () => {
		const cause = new Error("root");
		const err = mcpError("E_F", "factory", {
			hint: "h",
			server: "s",
			cause,
		});
		expect(err.hint).toBe("h");
		expect(err.context.server).toBe("s");
		expect(err.cause).toBe(cause);
	});
});
