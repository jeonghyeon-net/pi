import { visibleWidth } from "@mariozechner/pi-tui";
import { describe, expect, it } from "vitest";
import { createPiWelcomeHeader } from "../src/header.ts";
import { makeContext, theme } from "./header-test-helpers.ts";

describe("createPiWelcomeHeader layout", () => {
	it("renders a two-column welcome banner on wide terminals", () => {
		process.env.PI_DISPLAY_NAME = "JeongHyeon";
		const header = createPiWelcomeHeader(makeContext({ cwd: "/Users/me/Desktop/pi", sessionManager: { getEntries: () => [{}, {}] } }))({}, theme);
		header.invalidate();
		const plain = header.render(120).join("\n");
		expect(plain).toContain("Pi v");
		expect(plain).toContain("██████████████");
		expect(plain).not.toContain("claude-code-dark");
		expect(plain).toContain("Welcome back JeongHyeon!");
		expect(plain).toContain("Tips for getting started");
		expect(plain).toContain("Project   pi");
		expect(plain).toContain("Project directory detected and ready for work.");
		expect(plain).toContain("Workspace status");
	});

	it("falls back to a stacked layout on narrow terminals", () => {
		process.env.PI_DISPLAY_NAME = "pi user";
		const header = createPiWelcomeHeader(makeContext({ cwd: "/Users/me" }))({}, theme);
		const lines = header.render(72);
		const plain = lines.join("\n");
		expect(lines.every((line) => visibleWidth(line) <= 72)).toBe(true);
		expect(plain).toContain("██████████████");
		expect(plain).toContain("Welcome back Pi User!");
		expect(plain).toContain("No recent activity yet");
		expect(plain).toContain("Launched from your home directory. A project folder works best.");
	});

	it("handles tiny widths and session lookup failures", () => {
		delete process.env.PI_DISPLAY_NAME;
		delete process.env.CLAUDE_CODE_USER;
		delete process.env.USER;
		delete process.env.LOGNAME;
		const header = createPiWelcomeHeader(makeContext({ sessionManager: { getEntries: () => { throw new Error("boom"); } } }))({}, theme);
		for (const width of [1, 3, 4]) {
			expect(header.render(width).every((line) => visibleWidth(line) <= width)).toBe(true);
		}
		expect(header.render(1).join("\n")).toContain("╭");
	});

	it("keeps rendering after the original session context becomes stale", () => {
		let stale = false;
		const header = createPiWelcomeHeader({
			get cwd() { if (stale) throw new Error("stale"); return "/tmp/demo"; },
			get model() { if (stale) throw new Error("stale"); return { provider: "anthropic", id: "claude-sonnet-4-5" }; },
			sessionManager: { getEntries: () => { if (stale) throw new Error("stale"); return [{}, {}]; } },
		})({}, theme);
		stale = true;
		const plain = header.render(120).join("\n");
		expect(plain).toContain("Project   demo");
		expect(plain).toContain("Model     anthropic/claude-sonnet-4-5");
		expect(plain).toContain("Session   2 entries loaded in this session");
	});
});
