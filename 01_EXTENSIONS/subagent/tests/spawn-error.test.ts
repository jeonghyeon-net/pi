import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("child_process", () => {
	const { EventEmitter } = require("events");
	const { PassThrough } = require("stream");
	return { spawn: vi.fn(() => Object.assign(new EventEmitter(), { stdout: new PassThrough(), stderr: new PassThrough() })) };
});

import { spawnAndCollect } from "../src/spawn.js";
import { spawn } from "child_process";

const getLastProc = () => (spawn as ReturnType<typeof vi.fn>).mock.results.at(-1)?.value;

describe("spawnAndCollect error paths", () => {
	beforeEach(() => { vi.clearAllMocks(); });

	it("returns error result on non-zero exit with no output", async () => {
		const p = spawnAndCollect("node", [], 2, "worker");
		const proc = getLastProc();
		proc.stdout.end();
		proc.emit("close", 1);
		await expect(p).resolves.toMatchObject({ error: "Process exited with code 1" });
	});

	it("rejects on spawn error", async () => {
		const p = spawnAndCollect("nonexistent", [], 4, "scout");
		getLastProc().emit("error", new Error("ENOENT"));
		await expect(p).rejects.toThrow("ENOENT");
	});

	it("surfaces empty success as diagnostic error", async () => {
		const p = spawnAndCollect("node", [], 5, "scout");
		const proc = getLastProc();
		proc.stdout.write("not json\n\n");
		proc.stdout.end();
		proc.emit("close", 0);
		await expect(p).resolves.toMatchObject({ error: "Subagent finished without a visible assistant result", output: expect.stringContaining("source: empty") });
	});

	it("rejects with Aborted when signal fires", async () => {
		const ac = new AbortController();
		const p = spawnAndCollect("node", [], 6, "scout", ac.signal);
		const proc = getLastProc();
		proc.kill = vi.fn();
		ac.abort();
		await expect(p).rejects.toThrow("Aborted");
		expect(proc.kill).toHaveBeenCalled();
	});
});
