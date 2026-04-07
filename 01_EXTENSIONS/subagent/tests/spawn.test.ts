import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("child_process", () => {
	const { EventEmitter } = require("events");
	const { PassThrough } = require("stream");
	return { spawn: vi.fn(() => Object.assign(new EventEmitter(), { stdout: new PassThrough(), stderr: new PassThrough(), __mock: true })) };
});

import { spawnAndCollect } from "../src/spawn.js";
import { spawn } from "child_process";

const getLastProc = () => (spawn as ReturnType<typeof vi.fn>).mock.results.at(-1)?.value;
const assistant = (text: string, usage?: { inputTokens: number; outputTokens: number }) => JSON.stringify({ type: "message_end", message: { role: "assistant", content: [{ type: "text", text }], usage } });

describe("spawnAndCollect success paths", () => {
	beforeEach(() => { vi.clearAllMocks(); });

	it("resolves with parsed output on success", async () => {
		const p = spawnAndCollect("node", ["-e", "1"], 1, "scout");
		const proc = getLastProc();
		proc.stdout.write(assistant("hello", { inputTokens: 10, outputTokens: 5 }) + "\n");
		proc.stdout.end();
		proc.emit("close", 0);
		await expect(p).resolves.toMatchObject({ id: 1, agent: "scout", output: "hello", usage: { inputTokens: 10 } });
	});

	it("returns error result on non-zero exit when output exists", async () => {
		const p = spawnAndCollect("node", [], 3, "scout");
		const proc = getLastProc();
		proc.stdout.write(assistant("partial") + "\n");
		proc.stdout.end();
		proc.emit("close", 1);
		await expect(p).resolves.toMatchObject({ output: "partial", error: "Process exited with code 1" });
	});

	it("works without signal but reports empty success diagnostically", async () => {
		const p = spawnAndCollect("node", [], 7, "scout");
		const proc = getLastProc();
		proc.stdout.end();
		proc.emit("close", 0);
		await expect(p).resolves.toMatchObject({ id: 7, error: "Subagent finished without a visible assistant result" });
	});
});
