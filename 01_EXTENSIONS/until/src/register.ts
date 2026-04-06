import type { UntilTask } from "./types.js";
import { CUSTOM_TYPE, MAX_TASKS, MIN_INTERVAL_MS, MAX_EXPIRY_MS } from "./constants.js";
import { formatKoreanDuration, formatClock } from "./time-utils.js";
import { getTasks, addTask, allocateId, sendMessage, updateFooter } from "./state.js";
import { executeRun } from "./runner.js";

export function registerTask(
	intervalMs: number,
	intervalLabel: string,
	prompt: string,
	notifyFn: (msg: string, type?: "info" | "warning" | "error") => void,
): boolean {
	if (getTasks().size >= MAX_TASKS) {
		notifyFn(`최대 ${MAX_TASKS}개까지만 등록할 수 있어. /until-cancel로 정리해줘.`, "error");
		return false;
	}
	if (intervalMs < MIN_INTERVAL_MS) {
		notifyFn(`최소 간격은 1분이야. ${formatKoreanDuration(intervalMs)}은 너무 짧아.`, "error");
		return false;
	}
	const id = allocateId();
	const now = Date.now();
	const task: UntilTask = {
		id,
		prompt,
		intervalMs,
		intervalLabel,
		createdAt: now,
		expiresAt: now + MAX_EXPIRY_MS,
		nextRunAt: now,
		runCount: 0,
		inFlight: false,
		timer: setTimeout(() => executeRun(id), 0),
	};
	addTask(task);
	sendMessage({
		customType: CUSTOM_TYPE,
		content: `[until #${id}] 등록됨: ${intervalLabel}마다 반복\n만료: ${formatClock(task.expiresAt)}\nTask: ${prompt}`,
		display: true,
		details: { id, prompt, intervalMs, intervalLabel },
	});
	notifyFn(`⏳ until #${id} 등록됨 (${intervalLabel}마다)`, "info");
	updateFooter();
	return true;
}
