import { spawn } from "node:child_process";
import { parseJsonFromStdout } from "./decision.js";
import type { HookExecResult, JsonRecord } from "./types.js";

/** Convert an unknown thrown value to a printable message. */
export function errorToMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function execCommandHook(
  command: string,
  cwd: string,
  payload: JsonRecord,
  timeoutMs: number,
): Promise<HookExecResult> {
  return new Promise((resolve) => {
    const child = spawn("bash", ["-lc", command], {
      cwd,
      env: {
        ...process.env,
        CLAUDE_PROJECT_DIR: cwd,
        PWD: cwd,
      },
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let settled = false;
    let timedOut = false;

    const finalize = (code: number): void => {
      if (settled) return;
      settled = true;
      const json = parseJsonFromStdout(stdout);
      resolve({ command, code, stdout, stderr, timedOut, json });
    };

    let timeout: NodeJS.Timeout | undefined;
    if (Number.isFinite(timeoutMs) && timeoutMs > 0) {
      timeout = setTimeout(() => {
        timedOut = true;
        child.kill("SIGTERM");
        setTimeout(() => child.kill("SIGKILL"), 1000);
      }, timeoutMs);
    }

    child.stdout.on("data", (chunk: Buffer | string) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      if (timeout) clearTimeout(timeout);
      stderr += `\n${errorToMessage(error)}`;
      finalize(1);
    });

    child.on("close", (code) => {
      if (timeout) clearTimeout(timeout);
      finalize(typeof code === "number" ? code : 1);
    });

    try {
      child.stdin.write(`${JSON.stringify(payload)}\n`);
      child.stdin.end();
    } catch (error) {
      stderr += `\nstdin write failed: ${errorToMessage(error)}`;
      finalize(1);
    }
  });
}
