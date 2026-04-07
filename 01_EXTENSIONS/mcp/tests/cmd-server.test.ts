import { describe, expect, it, vi } from "vitest";
import { handleConnect, handleDisconnect, handleReconnect } from "../src/cmd-server.js";

describe("handleConnect", () => {
	it("calls connectFn and notifies on success", async () => {
		const connectFn = vi.fn().mockResolvedValue(undefined);
		const notify = vi.fn();
		await handleConnect("s1", { mcpServers: { s1: { command: "echo" } } }, connectFn, notify);
		expect(connectFn).toHaveBeenCalledWith("s1", { command: "echo" });
		expect(notify).toHaveBeenCalledWith(expect.stringContaining("Connected"), "info");
	});
	it("notifies error when server not in config", async () => {
		const connectFn = vi.fn();
		const notify = vi.fn();
		await handleConnect("bad", { mcpServers: {} }, connectFn, notify);
		expect(connectFn).not.toHaveBeenCalled();
		expect(notify).toHaveBeenCalledWith(expect.stringContaining("not found"), "error");
	});
	it("notifies error on connect failure", async () => {
		const connectFn = vi.fn().mockRejectedValue(new Error("timeout"));
		const notify = vi.fn();
		await handleConnect("s1", { mcpServers: { s1: { command: "echo" } } }, connectFn, notify);
		expect(notify).toHaveBeenCalledWith(expect.stringContaining("timeout"), "error");
	});
});

describe("handleDisconnect", () => {
	it("calls closeFn and notifies", async () => {
		const closeFn = vi.fn().mockResolvedValue(undefined);
		const notify = vi.fn();
		await handleDisconnect("s1", closeFn, notify);
		expect(closeFn).toHaveBeenCalledWith("s1");
		expect(notify).toHaveBeenCalledWith(expect.stringContaining("Disconnected"), "info");
	});
	it("notifies error on close failure", async () => {
		const closeFn = vi.fn().mockRejectedValue(new Error("stuck"));
		const notify = vi.fn();
		await handleDisconnect("s1", closeFn, notify);
		expect(notify).toHaveBeenCalledWith(expect.stringContaining("stuck"), "error");
	});
});

describe("handleReconnect", () => {
	it("reconnects specific server", async () => {
		const closeFn = vi.fn().mockResolvedValue(undefined);
		const connectFn = vi.fn().mockResolvedValue(undefined);
		const notify = vi.fn();
		const cfg = { mcpServers: { s1: { command: "echo" } } };
		await handleReconnect("s1", cfg, closeFn, connectFn, notify);
		expect(closeFn).toHaveBeenCalledWith("s1");
		expect(connectFn).toHaveBeenCalledWith("s1", { command: "echo" });
		expect(notify).toHaveBeenCalledWith(expect.stringContaining("Reconnected"), "info");
	});
	it("reconnects all servers when no name given", async () => {
		const closeFn = vi.fn().mockResolvedValue(undefined);
		const connectFn = vi.fn().mockResolvedValue(undefined);
		const notify = vi.fn();
		const cfg = { mcpServers: { s1: { command: "a" }, s2: { url: "b" } } };
		await handleReconnect(undefined, cfg, closeFn, connectFn, notify);
		expect(closeFn).toHaveBeenCalledTimes(2);
		expect(connectFn).toHaveBeenCalledTimes(2);
	});
	it("notifies error when server not found", async () => {
		const notify = vi.fn();
		await handleReconnect("bad", { mcpServers: {} }, vi.fn(), vi.fn(), notify);
		expect(notify).toHaveBeenCalledWith(expect.stringContaining("not found"), "error");
	});
	it("notifies error when reconnect fails mid-loop", async () => {
		const closeFn = vi.fn().mockRejectedValue(new Error("close-err"));
		const connectFn = vi.fn().mockResolvedValue(undefined);
		const notify = vi.fn();
		const cfg = { mcpServers: { s1: { command: "a" } } };
		await handleReconnect("s1", cfg, closeFn, connectFn, notify);
		expect(notify).toHaveBeenCalledWith(expect.stringContaining("close-err"), "error");
	});
	it("handles non-Error thrown during reconnect", async () => {
		const closeFn = vi.fn().mockRejectedValue("string-error");
		const notify = vi.fn();
		const cfg = { mcpServers: { s1: { command: "a" } } };
		await handleReconnect("s1", cfg, closeFn, vi.fn(), notify);
		expect(notify).toHaveBeenCalledWith(expect.stringContaining("string-error"), "error");
	});
});

describe("errorMsg branch: non-Error", () => {
	it("handles non-Error thrown during connect", async () => {
		const connectFn = vi.fn().mockRejectedValue("raw-string");
		const notify = vi.fn();
		await handleConnect("s1", { mcpServers: { s1: { command: "echo" } } }, connectFn, notify);
		expect(notify).toHaveBeenCalledWith(expect.stringContaining("raw-string"), "error");
	});
	it("handles non-Error thrown during disconnect", async () => {
		const closeFn = vi.fn().mockRejectedValue(42);
		const notify = vi.fn();
		await handleDisconnect("s1", closeFn, notify);
		expect(notify).toHaveBeenCalledWith(expect.stringContaining("42"), "error");
	});
});
