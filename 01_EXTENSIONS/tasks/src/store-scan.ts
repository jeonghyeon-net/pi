import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import type { TaskSnapshot, ToolContextLike } from "./types.js";

type StoreFile = { tasks?: TaskSnapshot[] };

function taskScope(cwd: string): string {
  try {
    const path = join(cwd, ".pi", "tasks-config.json");
    return JSON.parse(readFileSync(path, "utf8")).taskScope ?? "session";
  } catch {
    return "session";
  }
}

export function resolveTaskStorePath(ctx: ToolContextLike): string | undefined {
  const cwd = ctx.cwd ?? process.cwd();
  const override = process.env.PI_TASKS;
  if (override === "off") return;
  if (override?.startsWith("/")) return override;
  if (override?.startsWith(".")) return resolve(cwd, override);
  if (override) return join(homedir(), ".pi", "tasks", `${override}.json`);
  const scope = taskScope(cwd);
  if (scope === "memory") return;
  if (scope === "project") return join(cwd, ".pi", "tasks", "tasks.json");
  const sessionId = ctx.sessionManager?.getSessionId?.();
  return sessionId ? join(cwd, ".pi", "tasks", `tasks-${sessionId}.json`) : undefined;
}

export function readTaskSnapshots(ctx: ToolContextLike): TaskSnapshot[] {
  const path = resolveTaskStorePath(ctx);
  if (!path || !existsSync(path)) return [];
  try {
    const data = JSON.parse(readFileSync(path, "utf8")) as StoreFile;
    return Array.isArray(data.tasks) ? data.tasks : [];
  } catch {
    return [];
  }
}
