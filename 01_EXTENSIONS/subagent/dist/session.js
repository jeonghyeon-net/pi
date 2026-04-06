import { join } from "path";
import { homedir } from "os";
let history = [];
let pendingResults = [];
export function sessionPath(id, home) {
    return join(home ?? homedir(), ".pi", "agent", "sessions", "subagents", `run-${id}.json`);
}
export function addToHistory(item) { history.push(item); }
export function getRunHistory() { return [...history]; }
export function addPending(result) { pendingResults.push(result); }
export function drainPending() { return pendingResults.splice(0); }
export function resetPending() { pendingResults = []; }
export function buildRunsEntry() {
    return { runs: [...history], pending: [...pendingResults], updatedAt: Date.now() };
}
export function restoreRuns(entries) {
    const relevant = entries.filter((e) => e.type === "custom" && "customType" in e && e.customType === "subagent-runs");
    const last = relevant.at(-1);
    if (!last?.data || typeof last.data !== "object") {
        history = [];
        pendingResults = [];
        return;
    }
    const data = last.data;
    history = "runs" in data && Array.isArray(data.runs) ? [...data.runs] : [];
    pendingResults = "pending" in data && Array.isArray(data.pending) ? [...data.pending] : [];
}
export function getSessionFile(id) {
    return history.find((r) => r.id === id)?.sessionFile;
}
export function resetSession() {
    history = [];
    pendingResults = [];
}
