import type { ParsedInterval } from "./types.js";

/**
 * 다양한 형식의 interval 문자열을 파싱합니다.
 * 지원 형식: 5m, 1h, 5분, 1시간, 5분마다, 1시간마다
 *
 * @returns { ms, label } 또는 파싱 실패 시 null
 */

const INTERVAL_RE = /^(\d+(?:\.\d+)?)\s*(?:(m|h|분|시간)(?:마다)?)\s*$/i;

export function parseInterval(raw: string): ParsedInterval | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const match = trimmed.match(INTERVAL_RE);
  if (!match) return null;

  const amount = Number(match[1]);
  const unitRaw = (match[2] ?? "").toLowerCase();

  if (!Number.isFinite(amount) || amount <= 0) return null;

  switch (unitRaw) {
    case "m":
    case "분":
      return { ms: amount * 60 * 1000, label: `${amount}분` };
    case "h":
    case "시간":
      return { ms: amount * 60 * 60 * 1000, label: `${amount}시간` };
    default:
      return null;
  }
}
