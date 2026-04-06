import { join } from "path";
import { homedir } from "os";
let history = [];
export function sessionPath(id, home) {
    return join(home ?? homedir(), ".pi", "agent", "sessions", "subagents", `run-${id}.json`);
}
export function addToHistory(item) {
    history.push(item);
}
export function getRunHistory() {
    return [...history];
}
export function buildRunsEntry() {
    return { runs: [...history], updatedAt: Date.now() };
}
export function restoreRuns(entries) {
    const relevant = entries.filter((e) => e.type === "custom" && "customType" in e && e.customType === "subagent-runs");
    const last = relevant.at(-1);
    if (!last?.data || typeof last.data !== "object") {
        history = [];
        return;
    }
    const data = last.data;
    if ("runs" in data && Array.isArray(data.runs)) {
        history = [...data.runs];
    }
    else {
        history = [];
    }
}
export function resetSession() {
    history = [];
}
