import type { ExtensionUIContext } from "@mariozechner/pi-coding-agent";
import type { UntilTask, SendMessageFn, SendUserMessageFn } from "./types.js";
import { STATUS_KEY } from "./constants.js";
import { formatClock } from "./time-utils.js";

const tasks = new Map<number, UntilTask>();
let nextTaskId = 1;
let agentRunning = false;
let sendMsg: SendMessageFn | undefined;
let sendUserMsg: SendUserMessageFn | undefined;
let ui: ExtensionUIContext | undefined;

export function initApi(s: SendMessageFn, u: SendUserMessageFn): void {
	sendMsg = s;
	sendUserMsg = u;
}

export function sendMessage(...args: Parameters<SendMessageFn>): void {
	sendMsg?.(...args);
}

export function sendUserMessage(
	...args: Parameters<SendUserMessageFn>
): void {
	sendUserMsg?.(...args);
}

export function setUi(handle: ExtensionUIContext | undefined): void {
	ui = handle;
}

export function getUi(): ExtensionUIContext | undefined {
	return ui;
}

export function notify(msg: string, type?: "info" | "warning" | "error"): void {
	ui?.notify(msg, type);
}

export function setAgentRunning(val: boolean): void {
	agentRunning = val;
}

export function isAgentRunning(): boolean {
	return agentRunning;
}

export function getTasks(): Map<number, UntilTask> {
	return tasks;
}

export function getTask(id: number): UntilTask | undefined {
	return tasks.get(id);
}

export function allocateId(): number {
	return nextTaskId++;
}

export function addTask(task: UntilTask): void {
	tasks.set(task.id, task);
}

export function deleteTask(id: number): void {
	const task = tasks.get(id);
	if (task) clearTimeout(task.timer);
	tasks.delete(id);
	updateFooter();
}

export function clearAllTasks(): void {
	for (const t of tasks.values()) clearTimeout(t.timer);
	tasks.clear();
	updateFooter();
}

export function updateFooter(): void {
	if (!ui) return;
	if (tasks.size === 0) {
		ui.setStatus(STATUS_KEY, undefined);
		return;
	}
	let nearest = Number.POSITIVE_INFINITY;
	for (const t of tasks.values()) {
		if (t.nextRunAt < nearest) nearest = t.nextRunAt;
	}
	const next = nearest < Number.POSITIVE_INFINITY ? formatClock(nearest) : "\u2014";
	const text =
		ui.theme.fg("accent", `\u23F3 until \u00D7${tasks.size}`) +
		ui.theme.fg("dim", ` | next ${next}`);
	ui.setStatus(STATUS_KEY, text);
}
