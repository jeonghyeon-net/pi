import * as os from "node:os";
import * as path from "node:path";
import type { HeaderContext } from "./header-types.js";

export function getCwd(ctx: HeaderContext, fallback = "") {
	try {
		return ctx.cwd;
	} catch {
		return fallback;
	}
}

export function getModel(ctx: HeaderContext, fallback: HeaderContext["model"] = undefined) {
	try {
		return ctx.model;
	} catch {
		return fallback;
	}
}

export function createHeaderSnapshot(ctx: HeaderContext): HeaderContext {
	const cwd = getCwd(ctx);
	const model = getModel(ctx);
	const entryCount = getEntryCount(ctx);
	return {
		get cwd() { return getCwd(ctx, cwd); },
		get model() { return getModel(ctx, model); },
		sessionManager: { getEntries: () => Array.from({ length: getEntryCount(ctx, entryCount) }, () => null) },
	};
}

export function getProjectName(ctx: HeaderContext) {
	const cwd = getCwd(ctx);
	return path.basename(cwd) || cwd;
}

export function getDisplayName() {
	const raw = process.env.PI_DISPLAY_NAME ?? process.env.CLAUDE_CODE_USER ?? process.env.USER ?? process.env.LOGNAME ?? "there";
	return raw
		.trim()
		.replace(/[._-]+/g, " ")
		.replace(/\b\w/g, (char) => char.toUpperCase()) || "there";
}

export function getEntryCount(ctx: HeaderContext, fallback = 0) {
	try {
		return ctx.sessionManager.getEntries().length;
	} catch {
		return fallback;
	}
}

export function getModelLabel(ctx: HeaderContext) {
	const model = getModel(ctx);
	return model ? `${model.provider}/${model.id}` : "no-model";
}

export function isHomeDirectory(cwd: string) {
	return path.resolve(cwd) === path.resolve(os.homedir());
}

export function shortenPath(value: string, maxWidth: number) {
	const home = os.homedir();
	const normalized = value.startsWith(home) ? `~${value.slice(home.length)}` : value;
	return shortenMiddle(normalized, maxWidth);
}

export function shortenMiddle(value: string, maxWidth: number) {
	if (value.length <= maxWidth) return value;
	if (maxWidth <= 1) return "…";
	const head = Math.max(1, Math.ceil((maxWidth - 1) * 0.6));
	const tail = Math.max(0, maxWidth - head - 1);
	const suffix = value.slice(Math.max(0, value.length - tail));
	return `${value.slice(0, head)}…${suffix}`;
}
