import { visibleWidth } from "@mariozechner/pi-tui";
import { describe, expect, it } from "vitest";
import { colorizeRgb, stripAnsi } from "../src/ansi.ts";
import { WORKING_INDICATOR } from "../src/indicator.ts";
import { buildChromeRule, buildPromptFrame, findBottomRuleIndex, frameBodyLine } from "../src/rules.ts";
import { summarizeTextPreview, toolPrefix } from "../src/tool-utils.ts";
import { theme } from "./helpers.ts";

describe("claude-code-ui utils", () => {
	it("colors frames and strips ansi codes", () => {
		const colored = colorizeRgb("x", [1, 2, 3]);
		expect(colored).toContain("[38;2;1;2;3m");
		expect(stripAnsi(colored)).toBe("x");
		expect(WORKING_INDICATOR.frames).toHaveLength(4);
	});

	it("builds chrome rules, prompt frames and finds rule rows", () => {
		const rule = buildChromeRule(24, "prompt", (text) => text);
		expect(stripAnsi(rule)).toContain(" prompt ");
		expect(stripAnsi(buildPromptFrame(24, "message", "╭", "╮", (text) => text))).toContain("╭─ message ");
		expect(stripAnsi(buildPromptFrame(1, "", "╭", "╮", (text) => text))).toContain("╭");
		const basic = frameBodyLine(" body ", 6, (text) => text);
		expect(stripAnsi(basic)).toContain("│");
		expect(visibleWidth(basic)).toBe(6);
		expect(frameBodyLine("x", 2, (text) => text)).toBe("││");
		const framed = frameBodyLine("_pi:c\u0007\u001b[7m \u001b[0m", 20, (text) => text);
		expect(visibleWidth(framed)).toBe(20);
		expect(findBottomRuleIndex(["a", "─── ↓ 3 more ", "b"])).toBe(1);
		expect(findBottomRuleIndex(["a", "b"])).toBe(-1);
	});

	it("formats tool labels and previews", () => {
		expect(toolPrefix(theme, "Read")).toContain("Read");
		expect(summarizeTextPreview(theme, "a\nb\nc", 2)).toContain("1 more lines");
		expect(summarizeTextPreview(theme, "a\nb", 5)).not.toContain("more lines");
	});
});
