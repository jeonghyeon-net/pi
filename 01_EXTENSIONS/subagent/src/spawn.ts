import { spawn } from "child_process";
import { createInterface } from "readline";
import type { RunResult } from "./types.js";
import type { ParsedEvent } from "./parser.js";
import { parseLine } from "./parser.js";
import { collectOutput } from "./runner.js";

export function spawnAndCollect(
	cmd: string,
	args: string[],
	id: number,
	agentName: string,
	signal?: AbortSignal,
	onEvent?: (evt: ParsedEvent) => void,
): Promise<RunResult> {
	return new Promise((resolve, reject) => {
		const proc = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
		if (signal) {
			signal.addEventListener("abort", () => { proc.kill(); reject(new Error("Aborted")); });
		}
		const events: ParsedEvent[] = [];
		const rl = createInterface({ input: proc.stdout });
		rl.on("line", (line) => {
			const evt = parseLine(line);
			if (evt) { events.push(evt); onEvent?.(evt); }
		});
		proc.on("error", (err) => reject(err));
		proc.on("close", (code) => {
			const { output, usage, escalation } = collectOutput(events);
			if (code !== 0 && !output) {
				reject(new Error(`Process exited with code ${code}`));
				return;
			}
			resolve({ id, agent: agentName, output, usage, escalation });
		});
	});
}
