import type { ExtensionContext } from "@mariozechner/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";
import { stripAnsi } from "../src/ansi.ts";
import { createClaudeFooter } from "../src/footer.ts";
import { render, theme } from "./helpers.ts";

function plain(text: string) {
	return stripAnsi(text).replace(/<[^>]+>/g, "");
}

describe("theme footer stale context", () => {
	it("keeps rendering footer details after the extension context becomes stale", () => {
		let stale = false;
		const ctx = {
			get cwd() {
				if (stale) throw new Error("stale");
				return "/tmp/demo";
			},
			get model() {
				if (stale) throw new Error("stale");
				return { id: "sonnet" };
			},
			getContextUsage: () => {
				if (stale) throw new Error("stale");
				return { tokens: 0, contextWindow: 1, percent: 64 };
			},
			ui: { setTheme: vi.fn(() => ({ success: true })), theme },
		} as ExtensionContext;
		const footer = createClaudeFooter(ctx)({ requestRender: vi.fn() }, theme, { onBranchChange: () => vi.fn(), getGitBranch: () => "main" });
		stale = true;
		const text = render(footer, 220);
		expect(plain(text)).toContain("demo");
		expect(plain(text)).not.toContain("main");
		expect(plain(text)).toContain("sonnet");
		expect(plain(text)).toContain("context 64%");
	});
});
