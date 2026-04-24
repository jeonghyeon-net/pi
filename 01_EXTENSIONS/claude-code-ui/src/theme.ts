import type { ExtensionContext } from "@mariozechner/pi-coding-agent";

export const THEME_NAME = "claude-code-dark";

export function applyClaudeTheme(ctx: ExtensionContext) {
	const result = ctx.ui.setTheme(THEME_NAME);
	return {
		themeName: THEME_NAME,
		success: result.success,
		error: result.error,
	};
}
