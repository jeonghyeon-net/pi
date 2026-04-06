import type { LogLevel } from "./logger-format.js";
import { shouldLog, formatEntry } from "./logger-format.js";

export type { LogLevel };

export interface Logger {
	debug(msg: string): void;
	info(msg: string): void;
	warn(msg: string): void;
	error(msg: string): void;
	child(context: Record<string, string>): Logger;
}

export function createLogger(minLevel: LogLevel, context?: Record<string, string>): Logger {
	const log = (level: LogLevel, msg: string) => {
		if (!shouldLog(level, minLevel)) return;
		const line = formatEntry(level, msg, context);
		if (level === "error") console.error(line);
		else if (level === "warn") console.warn(line);
		else console.log(line);
	};
	return {
		debug: (msg) => log("debug", msg),
		info: (msg) => log("info", msg),
		warn: (msg) => log("warn", msg),
		error: (msg) => log("error", msg),
		child: (ctx) => createLogger(minLevel, { ...context, ...ctx }),
	};
}
