import { describe, expect, it, vi } from "vitest";
import { createMcpCommand, parseSubcommand } from "../src/cmd-router.js";

vi.mock("../src/state.js", () => ({
	getConnections: vi.fn(() => new Map()),
	getConfig: vi.fn(() => ({ mcpServers: {} })),
	getAllMetadata: vi.fn(() => new Map()),
}));
vi.mock("../src/failure-tracker.js", () => ({ getFailure: () => undefined }));
vi.mock("../src/constants.js", () => ({ OAUTH_TOKEN_DIR: "/tmp/oauth" }));
vi.mock("../src/search.js", () => ({ matchTool: () => true }));

describe("parseSubcommand", () => {
	it("parses 'status'", () => {
		expect(parseSubcommand("status")).toEqual({ cmd: "status", arg: undefined });
	});
	it("parses 'tools'", () => {
		expect(parseSubcommand("tools")).toEqual({ cmd: "tools", arg: undefined });
	});
	it("parses 'tools myserver'", () => {
		expect(parseSubcommand("tools myserver")).toEqual({ cmd: "tools", arg: "myserver" });
	});
	it("parses 'connect myserver'", () => {
		expect(parseSubcommand("connect myserver")).toEqual({ cmd: "connect", arg: "myserver" });
	});
	it("parses 'disconnect myserver'", () => {
		expect(parseSubcommand("disconnect myserver")).toEqual({ cmd: "disconnect", arg: "myserver" });
	});
	it("parses 'reconnect'", () => {
		expect(parseSubcommand("reconnect")).toEqual({ cmd: "reconnect", arg: undefined });
	});
	it("parses 'reconnect myserver'", () => {
		expect(parseSubcommand("reconnect myserver")).toEqual({ cmd: "reconnect", arg: "myserver" });
	});
	it("parses 'auth myserver'", () => {
		expect(parseSubcommand("auth myserver")).toEqual({ cmd: "auth", arg: "myserver" });
	});
	it("parses 'search web'", () => {
		expect(parseSubcommand("search web")).toEqual({ cmd: "search", arg: "web" });
	});
	it("trims whitespace", () => {
		expect(parseSubcommand("  status  ")).toEqual({ cmd: "status", arg: undefined });
	});
	it("returns help for empty string", () => {
		expect(parseSubcommand("")).toEqual({ cmd: "help", arg: undefined });
	});
	it("returns help for unknown subcommand", () => {
		expect(parseSubcommand("foobar")).toEqual({ cmd: "help", arg: undefined });
	});
	it("treats trailing space as no arg", () => {
		expect(parseSubcommand("tools ")).toEqual({ cmd: "tools", arg: undefined });
	});
});

describe("createMcpCommand", () => {
	it("returns CommandDef with description", () => {
		const def = createMcpCommand({ sendMessage: vi.fn() });
		expect(def.description).toContain("MCP");
	});
	it("handler is async function", () => {
		const def = createMcpCommand({ sendMessage: vi.fn() });
		expect(typeof def.handler).toBe("function");
	});
});
