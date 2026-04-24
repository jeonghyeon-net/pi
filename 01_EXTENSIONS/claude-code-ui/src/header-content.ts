import { getPiMascot } from "./header-mascot.js";
import type { HeaderContext, HeaderTheme } from "./header-types.js";
import { getCwd, getDisplayName, getEntryCount, getModelLabel, getProjectName, isHomeDirectory, shortenMiddle, shortenPath } from "./header-utils.js";

export function buildLeftColumn(ctx: HeaderContext, theme: HeaderTheme) {
	const cwd = getCwd(ctx);
	const projectName = getProjectName(ctx);
	const modelLabel = getModelLabel(ctx);
	const entryCount = getEntryCount(ctx);
	const sessionLabel = entryCount === 0 ? "No recent activity yet" : `${entryCount} ${entryCount === 1 ? "entry" : "entries"} loaded in this session`;
	const workspaceLabel = isHomeDirectory(cwd)
		? theme.fg("warning", "Launched from your home directory. A project folder works best.")
		: theme.fg("success", "Project directory detected and ready for work.");
	return [
		...getPiMascot(theme),
		theme.bold(`Welcome back ${getDisplayName()}!`),
		formatDetail(theme, "Project", projectName),
		formatDetail(theme, "Directory", shortenPath(cwd, 34)),
		formatDetail(theme, "Model", shortenMiddle(modelLabel, 34)),
		formatDetail(theme, "Session", sessionLabel),
		workspaceLabel,
	];
}

export function buildRightColumn(ctx: HeaderContext, theme: HeaderTheme) {
	const cwd = getCwd(ctx);
	const projectNote = isHomeDirectory(cwd)
		? theme.fg("muted", "Tip: launch pi inside a repository for stronger file and git context.")
		: theme.fg("muted", "Workspace note: pi can now reason over the current repository immediately.");
	return [
		theme.bold(theme.fg("accent", "Tips for getting started")),
		bullet(theme, "Ask pi to inspect the codebase before making edits."),
		bullet(theme, "Use TaskCreate for multi-step work and track progress."),
		bullet(theme, "Run /model to switch models and /reload to refresh extensions."),
		bullet(theme, "Ask for a plan first when the change touches several files."),
		"",
		theme.bold(theme.fg("accent", "Workspace status")),
		projectNote,
	];
}

function bullet(theme: HeaderTheme, text: string) {
	return `${theme.fg("accent", "•")} ${text}`;
}

function formatDetail(theme: HeaderTheme, label: string, value: string) {
	return `${theme.fg("muted", `${label.padEnd(9, " ")}`)} ${value}`;
}
