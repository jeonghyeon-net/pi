import type { ExtensionContext } from "@mariozechner/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";
import { stripAnsi } from "../src/ansi.ts";
import { createClaudeFooter } from "../src/footer.ts";
import { getProjectName } from "../src/header.ts";
import { THEME_NAME, applyClaudeTheme } from "../src/theme.ts";
import { render, theme } from "./helpers.ts";

function createCtx(percent: number | null, branchEntries: object[], modelId = "sonnet") {
	return {
		cwd: "/tmp/demo",
		model: modelId ? { id: modelId } : undefined,
		sessionManager: { getBranch: () => branchEntries },
		getContextUsage: () => ({ tokens: 0, contextWindow: 1, percent }),
		ui: { setTheme: vi.fn(() => ({ success: true })), theme },
	} as ExtensionContext;
}

function plain(text: string) {
	return stripAnsi(text).replace(/<[^>]+>/g, "");
}

describe("theme, header and footer", () => {
	it("applies the claude dark theme and resolves project names", () => {
		const ctx = createCtx(42, []);
		expect(applyClaudeTheme(ctx)).toEqual({ themeName: THEME_NAME, success: true, error: undefined });
		expect(ctx.ui.setTheme).toHaveBeenCalledWith(THEME_NAME);
		expect(getProjectName(ctx)).toBe("demo");
		expect(getProjectName({ cwd: "" } as ExtensionContext)).toBe("");
	});

	it("renders a clean footer with model, thinking level and a fill-style context badge", () => {
		const entries = [{ type: "thinking_level_change", thinkingLevel: "medium" }, { type: "message", message: { role: "assistant", usage: { input: 5000, output: 12000, cost: { total: 1.234 } } } }];
		const ctx = createCtx(42, entries);
		const footer = createClaudeFooter(ctx)({ requestRender: vi.fn() }, theme, { onBranchChange: () => vi.fn(), getGitBranch: () => "main" });
		footer.invalidate();
		footer.dispose();
		const text = render(footer, 220);
		expect(plain(text)).not.toContain("main");
		expect(plain(text)).toContain("sonnet");
		expect(plain(text)).toContain("medium");
		expect(plain(text)).not.toContain("effort");
		expect(plain(text)).toContain("context 42%");
		expect(text).toContain("\u001b[48;2;215;119;87m");
		expect(text).toContain("<bg:selectedBg>");
		expect(text).not.toContain("●●○○○");
		expect(text).not.toContain("$1.234");
		expect(text).not.toContain("↑5.0k ↓12k");
	});

	it("renders fallback values when model is missing, and hides effort when unavailable", () => {
		const entries = [{ type: "message", message: { role: "user" } }, { type: "message", message: { role: "assistant", usage: { input: 12, output: 900, cost: { total: 0.5 } } } }];
		const ctx = createCtx(null, entries, "");
		const footer = createClaudeFooter(ctx)({ requestRender: vi.fn() }, theme, { onBranchChange: () => vi.fn(), getGitBranch: () => null });
		const text = render(footer, 220);
		expect(plain(text)).toContain("no-model");
		expect(plain(text)).not.toContain("main");
		expect(plain(text)).not.toContain("effort");
		expect(plain(text)).toContain("context --");
		expect(text).not.toContain("\u001b[48;2;215;119;87m");
		expect(text).not.toContain("·····");
	});

	it("fills more of the badge as context usage increases", () => {
		const empty = render(createClaudeFooter(createCtx(0, []))({ requestRender: vi.fn() }, theme, { onBranchChange: () => vi.fn(), getGitBranch: () => "main" }), 220);
		const partial = render(createClaudeFooter(createCtx(42, []))({ requestRender: vi.fn() }, theme, { onBranchChange: () => vi.fn(), getGitBranch: () => "main" }), 220);
		const full = render(createClaudeFooter(createCtx(100, []))({ requestRender: vi.fn() }, theme, { onBranchChange: () => vi.fn(), getGitBranch: () => "main" }), 220);
		expect(empty).not.toContain("\u001b[48;2;215;119;87m");
		expect(partial).toContain("\u001b[48;2;215;119;87m");
		expect(partial).toContain("<bg:selectedBg>");
		expect(full).toContain("\u001b[48;2;215;119;87m");
		expect(full).not.toContain("<bg:selectedBg>");
	});
});
