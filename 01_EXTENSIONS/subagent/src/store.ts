import type { ActiveRun, RunResult } from "./types.js";

let counter = 0;
const active = new Map<number, ActiveRun>();
const completed: RunResult[] = [];

export function nextId(): number { return ++counter; }
export function addRun(run: ActiveRun): void { active.set(run.id, run); }
export function getRun(id: number): ActiveRun | undefined { return active.get(id); }
export function removeRun(id: number): void { active.delete(id); }
export function listRuns(): ActiveRun[] { return [...active.values()]; }
export function completeRun(_id: number, result: RunResult): void { completed.push(result); }
export function getCompleted(): RunResult[] { return [...completed]; }
export function drainCompleted(): RunResult[] { return completed.splice(0); }

export function resetStore(): void {
	counter = 0;
	active.clear();
	completed.length = 0;
}
