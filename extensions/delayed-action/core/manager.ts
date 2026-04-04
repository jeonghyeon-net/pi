import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { CUSTOM_TYPE } from "./constants.js";
import { formatClock, formatDuration } from "./parser.js";
import type { ParsedReminder, Reminder, ReminderDetails } from "./types.js";

export interface ReminderManager {
  reminders: Map<number, Reminder>;
  agentRunning: boolean;
  latestCtx: ExtensionContext | undefined;
  clearAll(): void;
  listLines(): string[];
  fire(id: number): void;
  schedule(parsed: ParsedReminder, ctx: ExtensionContext): void;
}

export function createReminderManager(pi: ExtensionAPI): ReminderManager {
  const reminders = new Map<number, Reminder>();
  let nextId = 1;
  let agentRunning = false;
  let latestCtx: ExtensionContext | undefined;

  const clearAll = () => {
    for (const r of reminders.values()) clearTimeout(r.timer);
    reminders.clear();
  };

  const listLines = (): string[] => {
    const now = Date.now();
    return Array.from(reminders.values())
      .sort((a, b) => a.dueAt - b.dueAt)
      .map((r) => `#${r.id} · ${formatDuration(Math.max(0, r.dueAt - now))} 후 · ${r.task}`);
  };

  const fire = (id: number) => {
    const reminder = reminders.get(id);
    if (!reminder) return;
    reminders.delete(id);
    const details: ReminderDetails = {
      id: reminder.id,
      task: reminder.task,
      dueAt: reminder.dueAt,
      createdAt: reminder.createdAt,
    };
    pi.sendMessage({
      customType: CUSTOM_TYPE,
      content: `[reminder#${reminder.id}] 시간 도달 (${formatClock(Date.now())})\nTask: ${reminder.task}`,
      display: true,
      details,
    });
    const prompt = `예약한 시간이 되었어. 지금 아래 작업을 수행해줘.\n\n${reminder.task}`;
    if (mgr.agentRunning) pi.sendUserMessage(prompt, { deliverAs: "followUp" });
    else pi.sendUserMessage(prompt);
    if (mgr.latestCtx?.hasUI) {
      mgr.latestCtx.ui.notify(`⏰ reminder #${reminder.id} 실행됨`, "info");
    }
  };

  const schedule = (parsed: ParsedReminder, ctx: ExtensionContext) => {
    const id = nextId;
    nextId += 1;
    const createdAt = Date.now();
    const dueAt = createdAt + parsed.delayMs;
    const timer = setTimeout(() => fire(id), parsed.delayMs);
    const reminder: Reminder = { id, ...parsed, createdAt, dueAt, timer };
    reminders.set(id, reminder);
    const details: ReminderDetails = {
      id,
      task: parsed.task,
      delayMs: parsed.delayMs,
      dueAt,
      createdAt,
    };
    pi.sendMessage({
      customType: CUSTOM_TYPE,
      content: `[reminder#${id}] 예약됨: ${parsed.delayLabel} 후\nTask: ${parsed.task}\nETA: ${formatClock(dueAt)}`,
      display: true,
      details,
    });
    if (ctx.hasUI) ctx.ui.notify(`⏰ reminder #${id} 설정됨 (${parsed.delayLabel})`, "info");
  };

  const mgr: ReminderManager = {
    reminders,
    get agentRunning() {
      return agentRunning;
    },
    set agentRunning(v: boolean) {
      agentRunning = v;
    },
    get latestCtx() {
      return latestCtx;
    },
    set latestCtx(v: ExtensionContext | undefined) {
      latestCtx = v;
    },
    clearAll,
    listLines,
    fire,
    schedule,
  };

  return mgr;
}

export function isOwnCustomMessage(m: object): boolean {
  return (
    "role" in m &&
    (m as { role: string }).role === "custom" &&
    "customType" in m &&
    (m as { customType: string }).customType === CUSTOM_TYPE
  );
}
