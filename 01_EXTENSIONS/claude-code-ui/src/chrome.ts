import type { ExtensionContext } from "@mariozechner/pi-coding-agent";
import { ClaudeCodeEditor } from "./editor.js";
import { createClaudeFooter } from "./footer.js";
import { createPiWelcomeHeader, getProjectName } from "./header.js";
import { applyClaudeTheme } from "./theme.js";

export function applyClaudeChrome(ctx: ExtensionContext) {
	const themeResult = applyClaudeTheme(ctx);
	ctx.ui.setHeader(createPiWelcomeHeader(ctx));
	ctx.ui.setFooter(createClaudeFooter(ctx));
	ctx.ui.setWidget("claude-code-ui-prompt", undefined);
	ctx.ui.setEditorComponent((tui, theme, keybindings) => new ClaudeCodeEditor(tui, theme, keybindings));
	ctx.ui.setHiddenThinkingLabel("");
	ctx.ui.setTitle(`π · ${getProjectName(ctx)}`);
	if (!themeResult.success) {
		ctx.ui.notify(
			`Claude UI applied, but theme switch failed: ${themeResult.error ?? "unknown error"}`,
			"warning",
		);
	}
}
