import { describe, expect, it, vi } from "vitest";
import { createStdioTransport } from "../src/transport-stdio.js";

describe("createStdioTransport", () => {
	it("spawns process with interpolated args", () => {
		const mockTransport = { close: vi.fn() };
		const factory = vi.fn().mockReturnValue(mockTransport);
		const env = { HOME: "/home/user" };
		const result = createStdioTransport(
			{ command: "node", args: ["${HOME}/server.js"], env: { KEY: "val" } },
			env, factory,
		);
		expect(factory).toHaveBeenCalledWith("node", ["/home/user/server.js"], {
			env: { KEY: "val" },
		});
		expect(result).toBe(mockTransport);
	});

	it("handles missing args", () => {
		const mockTransport = { close: vi.fn() };
		const factory = vi.fn().mockReturnValue(mockTransport);
		createStdioTransport({ command: "echo" }, {}, factory);
		expect(factory).toHaveBeenCalledWith("echo", [], { env: undefined });
	});

	it("interpolates env values", () => {
		const mockTransport = { close: vi.fn() };
		const factory = vi.fn().mockReturnValue(mockTransport);
		createStdioTransport(
			{ command: "cmd", env: { TOKEN: "${SECRET}" } },
			{ SECRET: "abc" }, factory,
		);
		expect(factory).toHaveBeenCalledWith("cmd", [], { env: { TOKEN: "abc" } });
	});

	it("passes cwd when provided", () => {
		const mockTransport = { close: vi.fn() };
		const factory = vi.fn().mockReturnValue(mockTransport);
		createStdioTransport(
			{ command: "cmd", cwd: "/work" }, {}, factory,
		);
		expect(factory).toHaveBeenCalledWith("cmd", [], {
			env: undefined, cwd: "/work",
		});
	});

	it("defaults command to empty string when undefined", () => {
		const mockTransport = { close: vi.fn() };
		const factory = vi.fn().mockReturnValue(mockTransport);
		createStdioTransport({}, {}, factory);
		expect(factory).toHaveBeenCalledWith("", [], { env: undefined });
	});
});
