/**
 * Time formatting helpers used by the until extension.
 * Subset of shared time-utils, kept local for self-containment.
 */

/**
 * Format milliseconds as a Korean duration string.
 * Picks the most natural unit: "5초", "3분", "2시간 10분".
 */
export function formatKoreanDuration(ms: number): string {
  if (ms < 60_000) return `${Math.max(1, Math.round(ms / 1000))}초`;
  if (ms < 3_600_000) return `${Math.max(1, Math.round(ms / 60_000))}분`;

  const hours = Math.floor(ms / 3_600_000);
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  if (minutes === 0) return `${hours}시간`;
  return `${hours}시간 ${minutes}분`;
}

/** Format a timestamp as a ko-KR 24-hour clock string, e.g. "14:05:30". */
export function formatClock(ts: number): string {
  return new Date(ts).toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}
