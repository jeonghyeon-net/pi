import { spawn } from "child_process";
import { createInterface } from "readline";
import type { RunResult } from "./types.js";
import type { ParsedEvent } from "./parser.js";
import { parseLine } from "./parser.js";
import { collectOutput, buildMissingOutputDiagnostic } from "./runner.js";
import { TERMINATION_GRACE_MS } from "./constants.js";

interface SpawnOptions {
	hardTimeoutMs?: number;
	idleTimeoutMs?: number;
}

export function spawnAndCollect(
	cmd: string,
	args: string[],
	id: number,
	agentName: string,
	signal?: AbortSignal,
	onEvent?: (evt: ParsedEvent) => void,
	options: SpawnOptions = {},
): Promise<RunResult> {
	return new Promise((resolve, reject) => {
		const proc = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
		const events: ParsedEvent[] = [];
		const stderrChunks: string[] = [];
		const rl = createInterface({ input: proc.stdout });
		let settled = false;
		let closed = false;
		let killTimer: ReturnType<typeof setTimeout> | undefined;
		let hardTimer: ReturnType<typeof setTimeout> | undefined;
		let idleTimer: ReturnType<typeof setTimeout> | undefined;

		const clearOptionalTimer = (timer: ReturnType<typeof setTimeout> | undefined) => {
			if (timer) clearTimeout(timer);
		};

		const cleanup = (keepKillTimer = false) => {
			if (!keepKillTimer) {
				clearOptionalTimer(killTimer);
				killTimer = undefined;
			}
			clearOptionalTimer(hardTimer);
			clearOptionalTimer(idleTimer);
			hardTimer = undefined;
			idleTimer = undefined;
			signal?.removeEventListener("abort", onAbort);
			rl.close();
		};

		const finishResolve = (result: RunResult) => {
			settled = true;
			cleanup();
			resolve(result);
		};

		const finishReject = (err: Error, keepKillTimer = false) => {
			settled = true;
			cleanup(keepKillTimer);
			reject(err);
		};

		const killProc = () => {
			proc.kill("SIGTERM");
			killTimer = setTimeout(() => {
				if (!closed) proc.kill("SIGKILL");
			}, TERMINATION_GRACE_MS);
		};

		const failForTimeout = (label: "idle" | "hard", timeoutMs: number) => {
			/* c8 ignore next */
			if (settled) return;
			killProc();
			finishReject(new Error(`Subagent ${label} timeout after ${Math.ceil(timeoutMs / 1000)}s`), true);
		};

		const scheduleIdleTimeout = () => {
			clearOptionalTimer(idleTimer);
			if (!options.idleTimeoutMs || options.idleTimeoutMs <= 0) return;
			idleTimer = setTimeout(() => failForTimeout("idle", options.idleTimeoutMs!), options.idleTimeoutMs);
		};

		const onAbort = () => {
			if (settled) return;
			killProc();
			finishReject(new Error("Aborted"), true);
		};

		if (options.hardTimeoutMs && options.hardTimeoutMs > 0) {
			hardTimer = setTimeout(() => failForTimeout("hard", options.hardTimeoutMs!), options.hardTimeoutMs);
		}
		scheduleIdleTimeout();

		if (signal?.aborted) {
			onAbort();
			return;
		}
		signal?.addEventListener("abort", onAbort, { once: true });

		rl.on("line", (line) => {
			scheduleIdleTimeout();
			const evt = parseLine(line);
			if (evt) { events.push(evt); onEvent?.(evt); }
		});
		proc.stderr.on("data", (chunk: Buffer) => { stderrChunks.push(chunk.toString()); scheduleIdleTimeout(); });
		proc.on("error", (err) => {
			if (settled) return;
			finishReject(err);
		});
		proc.on("close", (code) => {
			closed = true;
			if (settled) {
				cleanup();
				return;
			}
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
				finishResolve(result);
				return;
			}
			if (!result.output.trim()) {
				result.error = "Subagent finished without a visible assistant result";
				result.output = buildMissingOutputDiagnostic({ ...summary, stderr, exitCode: code });
			}
			finishResolve(result);
		});
	});
}
