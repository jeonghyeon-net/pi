import { describe, expect, it, vi } from "vitest";
import { handleAuth } from "../src/cmd-auth.js";

describe("handleAuth", () => {
	it("shows OAuth instructions when server has oauth auth", () => {
		const notify = vi.fn();
		const cfg = { mcpServers: { s1: { url: "http://x", auth: "oauth" as const } } };
		handleAuth("s1", cfg, "/fake/oauth", notify);
		expect(notify).toHaveBeenCalledWith(expect.stringContaining("OAuth"), "info");
		expect(notify).toHaveBeenCalledWith(expect.stringContaining("/fake/oauth/s1/tokens.json"), "info");
	});
	it("shows error when server not found", () => {
		const notify = vi.fn();
		handleAuth("bad", { mcpServers: {} }, "/fake/oauth", notify);
		expect(notify).toHaveBeenCalledWith(expect.stringContaining("not found"), "error");
	});
	it("shows error when server has no oauth auth", () => {
		const notify = vi.fn();
		const cfg = { mcpServers: { s1: { command: "echo" } } };
		handleAuth("s1", cfg, "/fake/oauth", notify);
		expect(notify).toHaveBeenCalledWith(expect.stringContaining("not configured for OAuth"), "error");
	});
	it("shows bearer instructions when server has bearer auth", () => {
		const notify = vi.fn();
		const cfg = { mcpServers: { s1: { url: "http://x", auth: "bearer" as const, bearerTokenEnv: "MY_TOKEN" } } };
		handleAuth("s1", cfg, "/fake/oauth", notify);
		expect(notify).toHaveBeenCalledWith(expect.stringContaining("bearer"), "info");
		expect(notify).toHaveBeenCalledWith(expect.stringContaining("MY_TOKEN"), "info");
	});
	it("shows bearer with direct token hint", () => {
		const notify = vi.fn();
		const cfg = { mcpServers: { s1: { url: "http://x", auth: "bearer" as const, bearerToken: "tok" } } };
		handleAuth("s1", cfg, "/fake/oauth", notify);
		expect(notify).toHaveBeenCalledWith(expect.stringContaining("bearerToken"), "info");
	});
});
