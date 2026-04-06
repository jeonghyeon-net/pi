let counter = 0;
const active = new Map();
const completed = [];
export function nextId() { return ++counter; }
export function addRun(run) { active.set(run.id, run); }
export function getRun(id) { return active.get(id); }
export function removeRun(id) { active.delete(id); }
export function listRuns() { return [...active.values()]; }
export function completeRun(_id, result) { completed.push(result); }
export function getCompleted() { return [...completed]; }
export function drainCompleted() { return completed.splice(0); }
export function resetStore() {
    counter = 0;
    active.clear();
    completed.length = 0;
}
