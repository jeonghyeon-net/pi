export type TimeUnit = "초" | "분" | "시간";

export interface ParsedReminder {
  task: string;
  delayMs: number;
  delayLabel: string;
}

export interface Reminder {
  id: number;
  task: string;
  delayMs: number;
  delayLabel: string;
  createdAt: number;
  dueAt: number;
  timer: ReturnType<typeof setTimeout>;
}

export interface ReminderDetails {
  id: number;
  task: string;
  delayMs?: number;
  dueAt: number;
  createdAt: number;
}
