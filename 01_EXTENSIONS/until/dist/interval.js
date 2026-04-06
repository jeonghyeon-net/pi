const INTERVAL_RE = /^(\d+(?:\.\d+)?)\s*(?:(m|h|분|시간)(?:마다)?)\s*$/i;
export function parseInterval(raw) {
    const trimmed = raw.trim();
    if (!trimmed)
        return null;
    const match = trimmed.match(INTERVAL_RE);
    if (!match)
        return null;
    const amount = Number(match[1]);
    const unitRaw = match[2].toLowerCase();
    if (!Number.isFinite(amount) || amount <= 0)
        return null;
    if (unitRaw === "m" || unitRaw === "분") {
        return { ms: amount * 60 * 1000, label: `${amount}분` };
    }
    return { ms: amount * 60 * 60 * 1000, label: `${amount}시간` };
}
