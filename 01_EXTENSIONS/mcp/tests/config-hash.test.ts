import { describe, expect, it } from "vitest";
import { computeConfigHash } from "../src/config-hash.js";

describe("computeConfigHash", () => {
	it("returns hex string for valid config", () => {
		const hash = computeConfigHash({
			mcpServers: { s1: { command: "echo" } },
		});
		expect(hash).toMatch(/^[a-f0-9]{64}$/);
	});

	it("excludes lifecycle field from hash", () => {
		const base = { mcpServers: { s1: { command: "echo" } } };
		const withLifecycle = {
			mcpServers: { s1: { command: "echo", lifecycle: "eager" as const } },
		};
		expect(computeConfigHash(base)).toBe(computeConfigHash(withLifecycle));
	});

	it("excludes idleTimeout field from hash", () => {
		const base = { mcpServers: { s1: { command: "echo" } } };
		const withTimeout = {
			mcpServers: { s1: { command: "echo", idleTimeout: 9999 } },
		};
		expect(computeConfigHash(base)).toBe(computeConfigHash(withTimeout));
	});

	it("excludes debug field from hash", () => {
		const base = { mcpServers: { s1: { command: "echo" } } };
		const withDebug = {
			mcpServers: { s1: { command: "echo", debug: true } },
		};
		expect(computeConfigHash(base)).toBe(computeConfigHash(withDebug));
	});

	it("different commands produce different hashes", () => {
		const a = { mcpServers: { s1: { command: "echo" } } };
		const b = { mcpServers: { s1: { command: "cat" } } };
		expect(computeConfigHash(a)).not.toBe(computeConfigHash(b));
	});

	it("empty mcpServers produces valid hash", () => {
		const hash = computeConfigHash({ mcpServers: {} });
		expect(hash).toMatch(/^[a-f0-9]{64}$/);
	});

	it("server order does not affect hash (sorted keys)", () => {
		const a = { mcpServers: { alpha: { command: "a" }, beta: { command: "b" } } };
		const b = { mcpServers: { beta: { command: "b" }, alpha: { command: "a" } } };
		expect(computeConfigHash(a)).toBe(computeConfigHash(b));
	});
});
