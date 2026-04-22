import { visibleWidth } from "@mariozechner/pi-tui";
import { describe, expect, it } from "vitest";
import { colorizeBgRgb, colorizeRgb, stripAnsi } from "../src/ansi.ts";
import { WORKING_INDICATOR } from "../src/indicator.ts";
import { buildChromeRule, buildPromptFrame, findBottomRuleIndex, frameBodyLine } from "../src/rules.ts";
import { summarizeArgs, summarizeTextPreview, toolLabel, toolPrefix } from "../src/tool-utils.ts";
import { theme } from "./helpers.ts";

describe("claude-code-ui utils", () => {
	it("colors frames and strips ansi codes", () => {
		const colored = colorizeRgb("x", [1, 2, 3]);
		const highlighted = colorizeBgRgb("x", [4, 5, 6]);
		const osc = "\x1b]133;A\u0007x\x1b]133;B\u0007";
		expect(colored).toContain("[38;2;1;2;3m");
		expect(highlighted).toContain("[48;2;4;5;6m");
		expect(stripAnsi(colored)).toBe("x");
		expect(stripAnsi(highlighted)).toBe("x");
		expect(stripAnsi(osc)).toBe("x");
		expect(WORKING_INDICATOR.frames).toHaveLength(6);
		expect(WORKING_INDICATOR.intervalMs).toBe(120);
		expect(stripAnsi(WORKING_INDICATOR.frames.join(""))).toContain("·✻✽✶✳✢");
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

	it("formats tool labels, args and previews", () => {
		expect(toolPrefix(theme, "Read")).toContain("Read");
		expect(toolLabel("mcp")).toBe("MCP");
		expect(toolLabel("task-create")).toBe("Task Create");
		expect(toolLabel("task__create")).toBe("Task  Create");
		expect(summarizeArgs({ action: "status", server: "creatrip-internal" })).toContain("status");
		expect(summarizeArgs({ value: true })).toContain("value=true");
		expect(summarizeArgs({ a: 1, b: 2, c: 3 })).toContain("a=1 · b=2");
		expect(summarizeArgs({})).toBe("");
		expect(summarizeArgs({ action: "status", server: "creatrip-internal" }, 6)).toContain("…");
		expect(summarizeArgs([])).toBe("");
		expect(summarizeArgs(undefined)).toBe("");
		expect(summarizeTextPreview(theme, "a\nb\nc", 2)).toContain("1 more lines");
		expect(summarizeTextPreview(theme, "a\nb", 5)).not.toContain("more lines");
	});
});
