import { describe, expect, it } from "vitest";
import {
	MAX_PROMPT_CHARS,
	MAX_STATUS_CHARS,
	MAX_TERMINAL_TITLE_CHARS,
	MAX_TITLE_CHARS,
	buildContextTitlePrompt,
	buildTitlePrompt,
	extractTextContent,
	formatStatusTitle,
	formatTerminalTitle,
	isClearSummaryTitle,
	looksLikePromptCopy,
	normalizeTitle,
} from "../src/title-format.ts";

describe("title format helpers", () => {
	it("builds prompts and extracts text content", () => {
		const longPrompt = "a".repeat(MAX_PROMPT_CHARS + 10);
		expect(buildTitlePrompt(longPrompt)).toBe(`User request:\n${"a".repeat(MAX_PROMPT_CHARS)}`);
		expect(
			buildContextTitlePrompt({
				currentTitle: "Current title",
				firstUserPrompt: "Initial request",
				recentUserPrompts: ["Initial request", "Add async updates"],
				latestAssistantText: "Implemented the first pass",
			}),
		).toContain("Recent user follow-ups:");
		expect(
			buildContextTitlePrompt({ currentTitle: undefined, firstUserPrompt: "", recentUserPrompts: [], latestAssistantText: "" }),
		).toBe("Session context:");
		expect(extractTextContent([{ type: "text", text: "Add " }, { type: "image" }, { type: "text", text: "title" }])).toBe("Add title");
	});

	it("normalizes generated titles", () => {
		expect(normalizeTitle("")).toBe("");
		expect(normalizeTitle('Session title: "Add session title extension"\nextra')).toBe("Add session title extension");
		expect(normalizeTitle("[릴리즈 체크리스트 정리!!!]")).toBe("릴리즈 체크리스트 정리");
		expect(normalizeTitle(`Title: ${"x".repeat(MAX_TITLE_CHARS + 10)}`)).toBe(`${"x".repeat(MAX_TITLE_CHARS - 1)}…`);
	});

	it("formats status and terminal titles", () => {
		expect(isClearSummaryTitle("세션/터미널 제목 자동 설정 extension")).toBe(true);
		expect(isClearSummaryTitle("이거 참고해서 세션 이름 만들어줘")).toBe(false);
		expect(looksLikePromptCopy("", "Please fix API timeout handling in diff-review command.")).toBe(false);
		expect(looksLikePromptCopy("Fix API timeout handling in diff-review command", "Fix API timeout handling in diff-review command")).toBe(true);
		expect(looksLikePromptCopy("Fix API timeout handling in diff-review command", "Please fix API timeout handling in diff-review command.")).toBe(true);
		expect(looksLikePromptCopy("API timeout handling in diff-review command", "Please fix API timeout handling in diff-review command.")).toBe(false);
		expect(formatStatusTitle(`a ${"b".repeat(MAX_STATUS_CHARS + 10)}`).length).toBeLessThanOrEqual(MAX_STATUS_CHARS);
		expect(formatTerminalTitle(undefined, "")).toBe("π - pi");
		const terminalTitle = formatTerminalTitle(`Ship ${"x".repeat(MAX_TERMINAL_TITLE_CHARS + 10)}`, "/tmp/pi-project");
		expect(terminalTitle).toMatch(/^π - /u);
		expect(terminalTitle.endsWith(" - pi-project")).toBe(true);
	});
});
