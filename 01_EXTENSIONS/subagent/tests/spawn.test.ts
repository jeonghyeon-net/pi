import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ParsedEvent } from "../src/parser.js";

vi.mock("child_process", () => {
	const { EventEmitter } = require("events");
	const { PassThrough } = require("stream");
	return {
		spawn: vi.fn(() => {
			const proc = new EventEmitter();
			proc.stdout = new PassThrough();
			proc.stderr = new PassThrough();
			(proc as Record<string, unknown>).__mock = true;
			return proc;
		}),
	};
});

import { spawnAndCollect } from "../src/spawn.js";
import { spawn } from "child_process";

function getLastProc() {
	const calls = (spawn as ReturnType<typeof vi.fn>).mock.results;
	return calls[calls.length - 1].value;
}

describe("spawnAndCollect", () => {
	beforeEach(() => { vi.clearAllMocks(); });

	it("resolves with parsed output on success", async () => {
		const p = spawnAndCollect("node", ["-e", "1"], 1, "scout");
		const proc = getLastProc();
		const msg = JSON.stringify({ type: "message_end", message: { role: "assistant", content: [{ type: "text", text: "hello" }], usage: { inputTokens: 10, outputTokens: 5 } } });
		proc.stdout.write(msg + "\n");
		proc.stdout.end();
		proc.emit("close", 0);
		const result = await p;
		expect(result.id).toBe(1);
		expect(result.agent).toBe("scout");
		expect(result.output).toBe("hello");
		expect(result.usage.inputTokens).toBe(10);
	});

	it("rejects on non-zero exit with no output", async () => {
		const p = spawnAndCollect("node", [], 2, "worker");
		const proc = getLastProc();
		proc.stdout.end();
		proc.emit("close", 1);
		await expect(p).rejects.toThrow("Process exited with code 1");
	});

	it("resolves on non-zero exit when output exists", async () => {
		const p = spawnAndCollect("node", [], 3, "scout");
		const proc = getLastProc();
		const msg = JSON.stringify({ type: "message_end", message: { role: "assistant", content: [{ type: "text", text: "partial" }] } });
		proc.stdout.write(msg + "\n");
		proc.stdout.end();
		proc.emit("close", 1);
		const result = await p;
		expect(result.output).toBe("partial");
	});

	it("rejects on spawn error", async () => {
		const p = spawnAndCollect("nonexistent", [], 4, "scout");
		const proc = getLastProc();
		proc.emit("error", new Error("ENOENT"));
		await expect(p).rejects.toThrow("ENOENT");
	});

	it("ignores non-parseable lines", async () => {
		const p = spawnAndCollect("node", [], 5, "scout");
		const proc = getLastProc();
		proc.stdout.write("not json\n");
		proc.stdout.write("\n");
		proc.stdout.end();
		proc.emit("close", 0);
		const result = await p;
		expect(result.output).toBe("");
	});
});
