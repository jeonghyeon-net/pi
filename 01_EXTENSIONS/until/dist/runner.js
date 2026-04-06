import { CUSTOM_TYPE, MIN_INTERVAL_MS, JITTER_RATIO } from "./constants.js";
import { formatKoreanDuration } from "./time-utils.js";
import { getTask, deleteTask, isAgentRunning, sendMessage, sendUserMessage, notify, updateFooter, } from "./state.js";
export function jitter(ms) {
    const offset = ms * JITTER_RATIO * (Math.random() * 2 - 1);
    return Math.max(MIN_INTERVAL_MS, Math.round(ms + offset));
}
export function scheduleNext(id) {
    const task = getTask(id);
    if (!task)
        return;
    clearTimeout(task.timer);
    const delay = jitter(task.intervalMs);
    task.nextRunAt = Date.now() + delay;
    task.timer = setTimeout(() => executeRun(id), delay);
    updateFooter();
}
function buildPrompt(task, elapsed) {
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
export function executeRun(id) {
    const task = getTask(id);
    if (!task)
        return;
    const now = Date.now();
    if (now >= task.expiresAt) {
        notify(`⏳ until #${task.id} 만료됨 (24시간 초과)`, "warning");
        sendMessage({
            customType: CUSTOM_TYPE,
            content: `[until #${task.id}] 24시간 만료로 자동 종료됨\n마지막 상태: ${task.lastSummary ?? "없음"}`,
            display: true,
        });
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
    notify(`⏳ until #${task.id} 실행 ${task.runCount}회차`, "info");
    task.inFlight = true;
    try {
        if (isAgentRunning()) {
            sendUserMessage(prompt, { deliverAs: "followUp" });
        }
        else {
            sendUserMessage(prompt);
        }
    }
    catch {
        task.inFlight = false;
    }
    scheduleNext(id);
}
