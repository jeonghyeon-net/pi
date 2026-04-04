import { DEFAULT_SOON_DELAY_MS, MAX_DELAY_MS } from "./constants.js";
import type { ParsedReminder, TimeUnit } from "./types.js";

const EXPLICIT_DELAY_RE =
  /^(\d+)\s*(초|분|시간)\s*(?:있다가|후(?:에)?|뒤(?:에)?)\s*[,，:]?\s*(.+)$/i;
const SOON_DELAY_RE = /^(?:좀|조금|잠깐|잠시)\s*(?:있다가|후(?:에)?|뒤(?:에)?)\s*[,，:]?\s*(.+)$/i;

export const DELAY_ONLY_RE =
  /^(?:\d+\s*(?:초|분|시간)|(?:좀|조금|잠깐|잠시))\s*(?:있다가|후(?:에)?|뒤(?:에)?)\s*$/i;

function toDelayMs(amount: number, unit: TimeUnit): number {
  if (unit === "초") return amount * 1000;
  if (unit === "시간") return amount * 60 * 60 * 1000;
  return amount * 60 * 1000;
}

export function formatDuration(ms: number): string {
  if (ms < 60_000) return `${Math.max(1, Math.round(ms / 1000))}초`;
  if (ms < 3_600_000) return `${Math.max(1, Math.round(ms / 60_000))}분`;

  const hours = Math.floor(ms / 3_600_000);
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  if (minutes === 0) return `${hours}시간`;
  return `${hours}시간 ${minutes}분`;
}

export function formatClock(ts: number): string {
  return new Date(ts).toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

export function parseReminderRequest(text: string): ParsedReminder | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const explicit = trimmed.match(EXPLICIT_DELAY_RE);
  if (explicit) {
    const amount = Number(explicit[1]);
    const unit = explicit[2] as TimeUnit;
    const task = explicit[3]?.trim() ?? "";
    if (!Number.isFinite(amount) || amount <= 0 || !task) return null;

    const delayMs = toDelayMs(amount, unit);
    if (delayMs > MAX_DELAY_MS) return null;

    return { task, delayMs, delayLabel: `${amount}${unit}` };
  }

  const soon = trimmed.match(SOON_DELAY_RE);
  if (soon) {
    const task = soon[1]?.trim() ?? "";
    if (!task) return null;
    return {
      task,
      delayMs: DEFAULT_SOON_DELAY_MS,
      delayLabel: formatDuration(DEFAULT_SOON_DELAY_MS),
    };
  }

  return null;
}

export function hasCustomType(m: object): m is { customType: string } {
  return "customType" in m;
}
