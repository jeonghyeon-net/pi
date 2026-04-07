import { spawn } from "child_process";
import { createInterface } from "readline";
import type { RunResult } from "./types.js";
import type { ParsedEvent } from "./parser.js";
import { parseLine } from "./parser.js";
import { collectOutput, buildMissingOutputDiagnostic } from "./runner.js";

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
		const stderrChunks: string[] = [];
		const rl = createInterface({ input: proc.stdout });
		rl.on("line", (line) => {
			const evt = parseLine(line);
			if (evt) { events.push(evt); onEvent?.(evt); }
		});
		proc.stderr.on("data", (chunk: Buffer) => { stderrChunks.push(chunk.toString()); });
		proc.on("error", (err) => reject(err));
		proc.on("close", (code) => {
			const summary = collectOutput(events);
			const stderr = stderrChunks.join("").trim();
			const result: RunResult = {
				id,
				agent: agentName,
				output: summary.output,
				usage: summary.usage,
				escalation: summary.escalation,
				stopReason: summary.stopReason,
			};
			if (code !== 0) {
				result.error = stderr || `Process exited with code ${code}`;
				if (!result.output) {
					result.output = buildMissingOutputDiagnostic({ ...summary, stderr, exitCode: code });
				}
				resolve(result);
				return;
			}
			if (!result.output.trim()) {
				result.error = "Subagent finished without a visible assistant result";
				result.output = buildMissingOutputDiagnostic({ ...summary, stderr, exitCode: code });
			}
			resolve(result);
		});
	});
}
