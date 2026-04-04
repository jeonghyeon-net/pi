import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";

import {
  CUSTOM_TYPE,
  JITTER_RATIO,
  MAX_EXPIRY_MS,
  MAX_TASKS,
  MIN_INTERVAL_MS,
  STATUS_KEY,
} from "./constants.js";
import { formatClock, formatKoreanDuration } from "./time.js";
import type { UntilTask } from "./types.js";

export interface TaskManager {
  readonly tasks: Map<number, UntilTask>;
  register(
    intervalMs: number,
    intervalLabel: string,
    prompt: string,
    ctx: ExtensionContext,
  ): boolean;
  remove(id: number): void;
  clearAll(): void;
  setAgentRunning(value: boolean): void;
  setLatestCtx(ctx: ExtensionContext): void;
  handleReport(taskId: number, done: boolean, summary: string): ReportResult;
}

export interface ReportResult {
  done: boolean;
  summary: string;
  taskId: number;
  runCount: number;
  nextRunAt?: number;
  text: string;
}

export function createTaskManager(pi: ExtensionAPI): TaskManager {
  const tasks = new Map<number, UntilTask>();
  let nextTaskId = 1;
  let agentRunning = false;
  let latestCtx: ExtensionContext | undefined;

  function updateFooter(): void {
    if (!latestCtx?.hasUI) return;
    const { theme } = latestCtx.ui;

    if (tasks.size === 0) {
      latestCtx.ui.setStatus(STATUS_KEY, undefined);
      return;
    }

    let nearestRun = Number.POSITIVE_INFINITY;
    for (const t of tasks.values()) {
      if (t.nextRunAt < nearestRun) nearestRun = t.nextRunAt;
    }

    const nextLabel = nearestRun < Number.POSITIVE_INFINITY ? formatClock(nearestRun) : "—";
    const text =
      theme.fg("accent", `⏳ until ×${tasks.size}`) + theme.fg("dim", ` | next ${nextLabel}`);

    latestCtx.ui.setStatus(STATUS_KEY, text);
  }

  function jitter(ms: number): number {
    const offset = ms * JITTER_RATIO * (Math.random() * 2 - 1);
    return Math.max(MIN_INTERVAL_MS, Math.round(ms + offset));
  }

  function scheduleNext(id: number): void {
    const task = tasks.get(id);
    if (!task) return;

    clearTimeout(task.timer);

    const delay = jitter(task.intervalMs);
    task.nextRunAt = Date.now() + delay;
    task.timer = setTimeout(() => executeRun(id), delay);
    updateFooter();
  }

  function executeRun(id: number): void {
    const task = tasks.get(id);
    if (!task) return;

    const now = Date.now();

    // 만료 체크
    if (now >= task.expiresAt) {
      if (latestCtx?.hasUI) {
        latestCtx.ui.notify(`⏳ until #${task.id} 만료됨 (24시간 초과)`, "warning");
      }
      pi.sendMessage({
        customType: CUSTOM_TYPE,
        content: `[until #${task.id}] 24시간 만료로 자동 종료됨\n마지막 상태: ${task.lastSummary ?? "없음"}`,
        display: true,
      });
      remove(id);
      return;
    }

    // 이전 실행이 아직 진행 중이면 다음 타이머만 재설정
    if (task.inFlight) {
      scheduleNext(id);
      return;
    }

    task.runCount++;

    const elapsed = formatKoreanDuration(now - task.createdAt);
    const wrappedPrompt = [
      `[until #${task.id} — 실행 ${task.runCount}회차, 경과 ${elapsed}, 간격 ${task.intervalLabel}]`,
      "",
      task.prompt,
      "",
      "작업을 수행한 뒤, 반드시 until_report 도구를 호출하여 결과를 보고하세요.",
      `- taskId: ${task.id} (이 값을 그대로 전달)`,
      "- done: true (조건 충족, 반복 종료) 또는 done: false (미충족, 계속 반복)",
      "- summary: 현재 상태를 한 줄로 요약",
    ].join("\n");

    if (latestCtx?.hasUI) {
      latestCtx.ui.notify(`⏳ until #${task.id} 실행 ${task.runCount}회차`, "info");
    }

    task.inFlight = true;

    try {
      if (agentRunning) {
        pi.sendUserMessage(wrappedPrompt, { deliverAs: "followUp" });
      } else {
        pi.sendUserMessage(wrappedPrompt);
      }
    } catch {
      // sendUserMessage 실패 시 inFlight 고착 방지
      task.inFlight = false;
    }

    scheduleNext(id);
  }

  function remove(id: number): void {
    const task = tasks.get(id);
    if (!task) return;
    clearTimeout(task.timer);
    tasks.delete(id);
    updateFooter();
  }

  function clearAll(): void {
    for (const task of tasks.values()) clearTimeout(task.timer);
    tasks.clear();
    updateFooter();
  }

  function register(
    intervalMs: number,
    intervalLabel: string,
    prompt: string,
    ctx: ExtensionContext,
  ): boolean {
    if (tasks.size >= MAX_TASKS) {
      ctx.ui.notify(`최대 ${MAX_TASKS}개까지만 등록할 수 있어. /until-cancel로 정리해줘.`, "error");
      return false;
    }

    if (intervalMs < MIN_INTERVAL_MS) {
      ctx.ui.notify(
        `최소 간격은 1분이야. ${formatKoreanDuration(intervalMs)}은 너무 짧아.`,
        "error",
      );
      return false;
    }

    const id = nextTaskId;
    nextTaskId += 1;
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

    tasks.set(id, task);

    pi.sendMessage({
      customType: CUSTOM_TYPE,
      content: `[until #${id}] 등록됨: ${intervalLabel}마다 반복\n만료: ${formatClock(task.expiresAt)}\nTask: ${prompt}`,
      display: true,
      details: { id, prompt, intervalMs, intervalLabel },
    });

    if (ctx.hasUI) {
      ctx.ui.notify(`⏳ until #${id} 등록됨 (${intervalLabel}마다)`, "info");
    }

    updateFooter();
    return true;
  }

  function handleReport(taskId: number, done: boolean, summary: string): ReportResult {
    const task = tasks.get(taskId);

    if (!task) {
      throw new Error(
        `until #${taskId} 작업을 찾을 수 없습니다. 이미 완료/취소/만료되었을 수 있습니다.`,
      );
    }

    task.inFlight = false;
    task.lastSummary = summary;

    if (done) {
      const elapsed = formatKoreanDuration(Date.now() - task.createdAt);

      pi.sendMessage({
        customType: CUSTOM_TYPE,
        content: `[until #${task.id}] ✅ 조건 충족! (${task.runCount}회 실행, ${elapsed} 경과)\n결과: ${summary}`,
        display: true,
      });

      if (latestCtx?.hasUI) {
        latestCtx.ui.notify(`✅ until #${task.id} 완료: ${summary}`, "info");
      }

      const result: ReportResult = {
        done: true,
        summary,
        taskId: task.id,
        runCount: task.runCount,
        text: `until #${task.id} 조건 충족으로 종료됨. ${summary}`,
      };

      remove(task.id);
      return result;
    }

    return {
      done: false,
      summary,
      taskId: task.id,
      runCount: task.runCount,
      nextRunAt: task.nextRunAt,
      text: `until #${task.id} 계속 반복. 다음 실행: ${formatClock(task.nextRunAt)}. ${summary}`,
    };
  }

  return {
    tasks,
    register,
    remove,
    clearAll,
    setAgentRunning(value: boolean) {
      agentRunning = value;
    },
    setLatestCtx(ctx: ExtensionContext) {
      latestCtx = ctx;
    },
    handleReport,
  };
}
