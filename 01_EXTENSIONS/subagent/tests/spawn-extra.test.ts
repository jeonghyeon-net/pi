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

describe("spawnAndCollect onEvent", () => {
	beforeEach(() => { vi.clearAllMocks(); });

	it("calls onEvent for each parsed event", async () => {
		const events: ParsedEvent[] = [];
		const p = spawnAndCollect("node", [], 1, "scout", undefined, (evt) => events.push(evt));
		const proc = getLastProc();
		const toolStart = JSON.stringify({ type: "tool_execution_start", toolName: "Bash" });
		const toolEnd = JSON.stringify({ type: "tool_execution_end", toolName: "Bash" });
		proc.stdout.write(toolStart + "\n");
		proc.stdout.write(toolEnd + "\n");
		proc.stdout.end();
		proc.emit("close", 0);
		await p;
		expect(events).toHaveLength(2);
		expect(events[0].type).toBe("tool_start");
		expect(events[0].toolName).toBe("Bash");
		expect(events[1].type).toBe("tool_end");
	});

	it("does not call onEvent for non-parseable lines", async () => {
		const events: ParsedEvent[] = [];
		const p = spawnAndCollect("node", [], 2, "scout", undefined, (evt) => events.push(evt));
		const proc = getLastProc();
		proc.stdout.write("not json\n");
		proc.stdout.end();
		proc.emit("close", 0);
		await p;
		expect(events).toHaveLength(0);
	});

	it("works without onEvent callback", async () => {
		const p = spawnAndCollect("node", [], 3, "scout", undefined);
		const proc = getLastProc();
		const msg = JSON.stringify({ type: "tool_execution_start", toolName: "Read" });
		proc.stdout.write(msg + "\n");
		proc.stdout.end();
		proc.emit("close", 0);
		const result = await p;
		expect(result.id).toBe(3);
	});
});
