import type { ExtensionContext } from "@mariozechner/pi-coding-agent";
import { ClaudeCodeEditor } from "./editor.js";
import { createClaudeFooter } from "./footer.js";
import { getProjectName } from "./header.js";
import { WORKING_INDICATOR } from "./indicator.js";
import { applyClaudeTheme } from "./theme.js";

export function applyClaudeChrome(ctx: ExtensionContext) {
	const themeResult = applyClaudeTheme(ctx);
	ctx.ui.setHeader(undefined);
	ctx.ui.setFooter(createClaudeFooter(ctx));
	ctx.ui.setWidget("claude-code-ui-prompt", undefined);
	ctx.ui.setEditorComponent((tui, theme, keybindings) => new ClaudeCodeEditor(tui, theme, keybindings));
	ctx.ui.setWorkingIndicator(WORKING_INDICATOR);
	ctx.ui.setHiddenThinkingLabel("");
	ctx.ui.setTitle(`Claude Code · ${getProjectName(ctx)}`);
	if (!themeResult.success) {
		ctx.ui.notify(
			`Claude UI applied, but theme switch failed: ${themeResult.error ?? "unknown error"}`,
			"warning",
		);
	}
}
