import { STATUS_KEY } from "./constants.js";
import { formatClock } from "./time-utils.js";
const tasks = new Map();
let nextTaskId = 1;
let agentRunning = false;
let sendMsg;
let sendUserMsg;
let ui;
export function initApi(s, u) {
    sendMsg = s;
    sendUserMsg = u;
}
export function sendMessage(...args) {
    sendMsg?.(...args);
}
export function sendUserMessage(...args) {
    sendUserMsg?.(...args);
}
export function setUi(handle) {
    ui = handle;
}
export function getUi() {
    return ui;
}
export function notify(msg, type) {
    ui?.notify(msg, type);
}
export function setAgentRunning(val) {
    agentRunning = val;
}
export function isAgentRunning() {
    return agentRunning;
}
export function getTasks() {
    return tasks;
}
export function getTask(id) {
    return tasks.get(id);
}
export function allocateId() {
    return nextTaskId++;
}
export function addTask(task) {
    tasks.set(task.id, task);
}
export function deleteTask(id) {
    const task = tasks.get(id);
    if (task)
        clearTimeout(task.timer);
    tasks.delete(id);
    updateFooter();
}
export function clearAllTasks() {
    for (const t of tasks.values())
        clearTimeout(t.timer);
    tasks.clear();
    updateFooter();
}
export function updateFooter() {
    if (!ui)
        return;
    if (tasks.size === 0) {
        ui.setStatus(STATUS_KEY, undefined);
        return;
    }
    let nearest = Number.POSITIVE_INFINITY;
    for (const t of tasks.values()) {
        if (t.nextRunAt < nearest)
            nearest = t.nextRunAt;
    }
    const next = nearest < Number.POSITIVE_INFINITY ? formatClock(nearest) : "\u2014";
    const text = ui.theme.fg("accent", `\u23F3 until \u00D7${tasks.size}`) +
        ui.theme.fg("dim", ` | next ${next}`);
    ui.setStatus(STATUS_KEY, text);
}
