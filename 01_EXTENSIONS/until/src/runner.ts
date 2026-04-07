import type { UntilTask } from "./types.js";
import { MIN_INTERVAL_MS, JITTER_RATIO } from "./constants.js";
import { formatKoreanDuration } from "./time-utils.js";
import { getTask, deleteTask, isAgentRunning, sendUserMessage, updateFooter } from "./state.js";

export function jitter(ms: number): number {
	const offset = ms * JITTER_RATIO * (Math.random() * 2 - 1);
	return Math.max(MIN_INTERVAL_MS, Math.round(ms + offset));
}

export function scheduleNext(id: number): void {
	const task = getTask(id);
	if (!task) return;
	clearTimeout(task.timer);
	const delay = jitter(task.intervalMs);
	task.nextRunAt = Date.now() + delay;
	task.timer = setTimeout(() => executeRun(id), delay);
	updateFooter();
}

function buildPrompt(task: UntilTask, elapsed: string): string {
	return [
		`[until #${task.id} — 실행 ${task.runCount}회차, 경과 ${elapsed}, 간격 ${task.intervalLabel}]`,
		"",
		task.prompt,
		"",
		"작업을 수행한 뒤, 반드시 until_report 도구를 호출하여 결과를 보고하세요.",
		`- taskId: ${task.id} (이 값을 그대로 전달)`,
		"- done: true (조건 충족, 반복 종료) 또는 done: false (미충족, 계속 반복)",
		"- summary: 현재 상태를 한 줄로 요약",
	].join("\n");
}

export function executeRun(id: number): void {
	const task = getTask(id);
	if (!task) return;
	const now = Date.now();
	if (now >= task.expiresAt) {
		deleteTask(id);
		return;
	}
	if (task.inFlight) {
		scheduleNext(id);
		return;
	}
	task.runCount++;
	const elapsed = formatKoreanDuration(now - task.createdAt);
	const prompt = buildPrompt(task, elapsed);
	task.inFlight = true;
	try {
		if (isAgentRunning()) {
			sendUserMessage(prompt, { deliverAs: "followUp" });
		} else {
			sendUserMessage(prompt);
		}
	} catch {
		task.inFlight = false;
	}
	scheduleNext(id);
}
