import type { ExtensionContext } from "@mariozechner/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";
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

describe("theme, header and footer", () => {
	it("applies the claude dark theme and resolves project names", () => {
		const ctx = createCtx(42, []);
		expect(applyClaudeTheme(ctx)).toEqual({ themeName: THEME_NAME, success: true, error: undefined });
		expect(ctx.ui.setTheme).toHaveBeenCalledWith(THEME_NAME);
		expect(getProjectName(ctx)).toBe("demo");
		expect(getProjectName({ cwd: "" } as ExtensionContext)).toBe("");
	});

	it("renders branch, model and a context badge", () => {
		const entries = [{ type: "message", message: { role: "assistant", usage: { input: 5000, output: 12000, cost: { total: 1.234 } } } }];
		const ctx = createCtx(42, entries);
		let onChange = () => {};
		const footer = createClaudeFooter(ctx)({ requestRender: vi.fn() }, theme, { onBranchChange: (fn) => (onChange = fn, vi.fn()), getGitBranch: () => "main" });
		footer.invalidate();
		onChange();
		const text = render(footer, 220);
		expect(text).toContain("main");
		expect(text).toContain("sonnet");
		expect(text).toContain("context 42%");
		expect(text).not.toContain("●●○○○");
		expect(text).not.toContain("$1.234");
		expect(text).not.toContain("↑5.0k ↓12k");
	});

	it("renders fallback values when branch or model are missing", () => {
		const entries = [
			{ type: "message", message: { role: "user" } },
			{ type: "message", message: { role: "assistant", usage: { input: 12, output: 900, cost: { total: 0.5 } } } },
		];
		const ctx = createCtx(null, entries, "");
		const footer = createClaudeFooter(ctx)({ requestRender: vi.fn() }, theme, { onBranchChange: () => vi.fn(), getGitBranch: () => null });
		const text = render(footer, 220);
		expect(text).toContain("no-model");
		expect(text).toContain("context --");
		expect(text).not.toContain("·····");
	});

	it("uses different context badge tones as usage increases", () => {
		const warm = createClaudeFooter(createCtx(74, []))({ requestRender: vi.fn() }, theme, { onBranchChange: () => vi.fn(), getGitBranch: () => "main" });
		const hot = createClaudeFooter(createCtx(80, []))({ requestRender: vi.fn() }, theme, { onBranchChange: () => vi.fn(), getGitBranch: () => "main" });
		const critical = createClaudeFooter(createCtx(91, []))({ requestRender: vi.fn() }, theme, { onBranchChange: () => vi.fn(), getGitBranch: () => "main" });
		expect(render(warm, 220)).toContain("<accent> context 74% </accent>");
		expect(render(hot, 220)).toContain("<warning> context 80% </warning>");
		expect(render(critical, 220)).toContain("<error> context 91% </error>");
	});
});
