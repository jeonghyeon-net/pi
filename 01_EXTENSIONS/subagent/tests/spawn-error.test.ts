import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("child_process", () => {
	const { EventEmitter } = require("events");
	const { PassThrough } = require("stream");
	return { spawn: vi.fn(() => Object.assign(new EventEmitter(), { stdout: new PassThrough(), stderr: new PassThrough(), kill: vi.fn() })) };
});

import { spawnAndCollect } from "../src/spawn.js";
import { spawn } from "child_process";

const getLastProc = () => (spawn as ReturnType<typeof vi.fn>).mock.results.at(-1)?.value;

describe("spawnAndCollect error paths", () => {
	beforeEach(() => { vi.clearAllMocks(); });
	afterEach(() => { vi.useRealTimers(); });

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
		expect(proc.kill).toHaveBeenCalledWith("SIGTERM");
		proc.emit("error", new Error("late error"));
		proc.emit("close", 1);
	});

	it("ignores duplicate abort callbacks after already settling", async () => {
		let abortHandler: (() => void) | undefined;
		const signal = {
			aborted: false,
			addEventListener: vi.fn((_event: string, cb: () => void) => { abortHandler = cb; }),
			removeEventListener: vi.fn(),
		} as unknown as AbortSignal;
		const p = spawnAndCollect("node", [], 61, "scout", signal);
		const proc = getLastProc();
		proc.kill = vi.fn();
		abortHandler?.();
		await expect(p).rejects.toThrow("Aborted");
		abortHandler?.();
		expect(proc.kill).toHaveBeenCalledTimes(1);
	});

	it("aborts immediately when signal is already canceled", async () => {
		const ac = new AbortController();
		ac.abort();
		const p = spawnAndCollect("node", [], 7, "scout", ac.signal);
		const proc = getLastProc();
		await expect(p).rejects.toThrow("Aborted");
		expect(proc.kill).toHaveBeenCalledWith("SIGTERM");
	});

	it("escalates to SIGKILL if aborted child does not exit", async () => {
		vi.useFakeTimers();
		const ac = new AbortController();
		const p = spawnAndCollect("node", [], 8, "scout", ac.signal);
		const proc = getLastProc();
		proc.kill = vi.fn();
		ac.abort();
		await expect(p).rejects.toThrow("Aborted");
		vi.advanceTimersByTime(5000);
		expect(proc.kill).toHaveBeenNthCalledWith(1, "SIGTERM");
		expect(proc.kill).toHaveBeenNthCalledWith(2, "SIGKILL");
	});

	it("rejects on hard timeout", async () => {
		vi.useFakeTimers();
		const p = spawnAndCollect("node", [], 9, "scout", undefined, undefined, { hardTimeoutMs: 1000 });
		const proc = getLastProc();
		proc.kill = vi.fn();
		vi.advanceTimersByTime(1000);
		await expect(p).rejects.toThrow("hard timeout");
		expect(proc.kill).toHaveBeenCalledWith("SIGTERM");
	});

	it("rejects on idle timeout", async () => {
		vi.useFakeTimers();
		const p = spawnAndCollect("node", [], 10, "scout", undefined, undefined, { idleTimeoutMs: 1000 });
		const proc = getLastProc();
		proc.kill = vi.fn();
		vi.advanceTimersByTime(1000);
		await expect(p).rejects.toThrow("idle timeout");
		expect(proc.kill).toHaveBeenCalledWith("SIGTERM");
	});

	it("resets idle timeout when child produces output", async () => {
		vi.useFakeTimers();
		const p = spawnAndCollect("node", [], 11, "scout", undefined, undefined, { idleTimeoutMs: 1000 });
		const proc = getLastProc();
		proc.kill = vi.fn();
		vi.advanceTimersByTime(900);
		proc.stdout.write("not json\n");
		vi.advanceTimersByTime(900);
		expect(proc.kill).not.toHaveBeenCalled();
		proc.stdout.end();
		proc.emit("close", 1);
		await expect(p).resolves.toMatchObject({ error: "Process exited with code 1" });
	});
});
