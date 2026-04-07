export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

export function shouldLog(level: LogLevel, minLevel: LogLevel): boolean {
	return LEVEL_ORDER[level] >= LEVEL_ORDER[minLevel];
}

export function formatEntry(
	level: LogLevel,
	message: string,
	context?: Record<string, string | undefined>,
): string {
	const prefix = `[mcp:${level}]`;
	const ctxStr = context
		? Object.entries(context).filter(([, v]) => v !== undefined).map(([k, v]) => `${k}=${v}`).join(" ")
		: "";
	return ctxStr ? `${prefix} ${message} (${ctxStr})` : `${prefix} ${message}`;
}
