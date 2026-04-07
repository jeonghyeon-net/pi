import { describe, expect, it, vi } from "vitest";
import { createMcpCommand } from "../src/cmd-router.js";
import * as state from "../src/state.js";

vi.mock("../src/state.js", () => ({
	getConnections: vi.fn(() => new Map()),
	getConfig: vi.fn(() => ({ mcpServers: { s1: { command: "echo" } } })),
	getAllMetadata: vi.fn(() => new Map([["s1", [{ name: "s1_t", originalName: "t", serverName: "s1", description: "d" }]]])),
}));
vi.mock("../src/failure-tracker.js", () => ({ getFailure: () => undefined }));
vi.mock("../src/constants.js", () => ({ OAUTH_TOKEN_DIR: "/tmp/oauth" }));
vi.mock("../src/search.js", () => ({ matchTool: () => true }));

function makeCtx() { return { ui: { notify: vi.fn() } }; }
function makePi() { return { sendMessage: vi.fn() }; }

describe("handler routing", () => {
	it("routes status", async () => {
		const ctx = makeCtx();
		await createMcpCommand(makePi()).handler("status", ctx);
		expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringContaining("s1"), "info");
	});
	it("routes tools", async () => {
		const ctx = makeCtx();
		await createMcpCommand(makePi()).handler("tools", ctx);
		expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringContaining("s1"), "info");
	});
	it("routes connect", async () => {
		const ctx = makeCtx();
		const fn = vi.fn().mockResolvedValue(undefined);
		await createMcpCommand(makePi(), fn).handler("connect s1", ctx);
		expect(fn).toHaveBeenCalled();
	});
	it("routes disconnect", async () => {
		const ctx = makeCtx();
		const fn = vi.fn().mockResolvedValue(undefined);
		await createMcpCommand(makePi(), undefined, fn).handler("disconnect s1", ctx);
		expect(fn).toHaveBeenCalled();
	});
	it("routes reconnect", async () => {
		const ctx = makeCtx();
		const c = vi.fn().mockResolvedValue(undefined);
		const d = vi.fn().mockResolvedValue(undefined);
		await createMcpCommand(makePi(), c, d).handler("reconnect s1", ctx);
		expect(d).toHaveBeenCalled();
		expect(c).toHaveBeenCalled();
	});
	it("routes auth", async () => {
		const ctx = makeCtx();
		await createMcpCommand(makePi()).handler("auth s1", ctx);
		expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringContaining("not configured"), "error");
	});
	it("routes search", async () => {
		const ctx = makeCtx();
		await createMcpCommand(makePi()).handler("search web", ctx);
		expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringContaining("web"), "info");
	});
	it("shows help for empty input", async () => {
		const ctx = makeCtx();
		await createMcpCommand(makePi()).handler("", ctx);
		expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringContaining("Usage"), "info");
	});
	it("shows usage for connect without arg", async () => {
		const ctx = makeCtx();
		await createMcpCommand(makePi()).handler("connect", ctx);
		expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringContaining("Usage"), "error");
	});
	it("shows usage for disconnect without arg", async () => {
		const ctx = makeCtx();
		await createMcpCommand(makePi()).handler("disconnect", ctx);
		expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringContaining("Usage"), "error");
	});
	it("shows usage for auth without arg", async () => {
		const ctx = makeCtx();
		await createMcpCommand(makePi()).handler("auth", ctx);
		expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringContaining("Usage"), "error");
	});
	it("shows usage for search without arg", async () => {
		const ctx = makeCtx();
		await createMcpCommand(makePi()).handler("search", ctx);
		expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringContaining("Usage"), "error");
	});
	it("uses noop connect/close when none provided", async () => {
		const ctx = makeCtx();
		const def = createMcpCommand(makePi());
		await def.handler("connect s1", ctx);
		expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringContaining("Connected"), "info");
		await def.handler("disconnect s1", ctx);
		expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringContaining("Disconnected"), "info");
	});
	it("falls back to empty config when getConfig returns null", async () => {
		vi.mocked(state.getConfig).mockReturnValueOnce(null);
		const ctx = makeCtx();
		await createMcpCommand(makePi()).handler("status", ctx);
		expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringContaining("No servers"), "info");
	});
});
