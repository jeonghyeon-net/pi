import { join } from "path";
import { homedir } from "os";

interface RunHistoryItem {
	id: number;
	agent: string;
	output?: string;
	sessionFile?: string;
}

let history: RunHistoryItem[] = [];

export function sessionPath(id: number, home?: string): string {
	return join(home ?? homedir(), ".pi", "agent", "sessions", "subagents", `run-${id}.json`);
}

export function addToHistory(item: RunHistoryItem): void {
	history.push(item);
}

export function getRunHistory(): RunHistoryItem[] {
	return [...history];
}

export function buildRunsEntry(): { runs: RunHistoryItem[]; updatedAt: number } {
	return { runs: [...history], updatedAt: Date.now() };
}

export function restoreRuns(entries: Array<{ type: string }>): void {
	const relevant = entries.filter(
		(e): e is { type: "custom"; customType: string; data?: Record<string, unknown> } =>
			e.type === "custom" && "customType" in e && (e as { customType?: string }).customType === "subagent-runs",
	);
	const last = relevant.at(-1);
	if (!last?.data || typeof last.data !== "object") {
		history = [];
		return;
	}
	const data = last.data;
	if ("runs" in data && Array.isArray(data.runs)) {
		history = [...(data.runs as RunHistoryItem[])];
	} else {
		history = [];
	}
}

export function resetSession(): void {
	history = [];
}
