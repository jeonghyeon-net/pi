import { describe, it, expect } from "vitest";
import { visibleWidth } from "@mariozechner/pi-tui";
import { buildCallText, buildResultText, renderCall, renderResult } from "../src/render.js";

describe("buildCallText", () => {
	it("shows run command", () => {
		expect(buildCallText({ command: "run scout -- find auth" })).toContain("scout");
	});

	it("shows batch count", () => {
		expect(buildCallText({ command: "batch --agent w --task a --agent r --task b" })).toContain("2");
	});

	it("shows chain steps", () => {
		expect(buildCallText({ command: "chain --agent s --task a --agent w --task b" })).toContain("chain");
	});

	it("shows continue", () => {
		expect(buildCallText({ command: "continue 3 -- more work" })).toContain("#3");
	});

	it("shows detail", () => {
		expect(buildCallText({ command: "detail 5" })).toContain("#5");
	});

	it("shows runs", () => {
		expect(buildCallText({ command: "runs" })).toContain("runs");
	});

	it("shows abort", () => {
		expect(buildCallText({ command: "abort 5" })).toContain("#5");
	});

	it("handles invalid command gracefully", () => {
		expect(buildCallText({ command: "invalid stuff" })).toContain("invalid stuff");
	});
});

describe("buildResultText", () => {
	it("formats success", () => {
		const text = buildResultText({ id: 1, agent: "scout", output: "found it", usage: { inputTokens: 100, outputTokens: 50, turns: 2 } });
		expect(text).toContain("scout #1");
		expect(text).toContain("found it");
	});

	it("formats error", () => {
		const text = buildResultText({ id: 1, agent: "worker", output: "", error: "crashed", usage: { inputTokens: 0, outputTokens: 0, turns: 0 } });
		expect(text).toContain("error");
		expect(text).toContain("crashed");
	});

	it("formats escalation with continue hint", () => {
		const text = buildResultText({ id: 1, agent: "worker", output: "", escalation: "delete file?", usage: { inputTokens: 0, outputTokens: 0, turns: 0 } });
		expect(text).toContain("needs your input");
		expect(text).toContain("delete file?");
		expect(text).toContain("subagent continue 1");
	});
});

describe("renderCall", () => {
	it("returns component with render method", () => {
		const comp = renderCall({ command: "run scout -- find auth" });
		expect(comp.render(80)).toBeInstanceOf(Array);
		expect(comp.render(80)[0]).toContain("scout");
		comp.invalidate();
	});

	it("truncates wide characters by visible width", () => {
		const comp = renderCall({ command: "run challenger -- 너는 가위바위보 선수 A다. 다른 선수의 선택은 모른다고 가정하고, 가위/바위/보 중 하나를 독립적으로 선택하라." });
		const line = comp.render(40)[0] ?? "";
		expect(visibleWidth(line)).toBeLessThanOrEqual(40);
	});
});

describe("renderResult", () => {
	it("returns component with render method", () => {
		const comp = renderResult({ content: [{ type: "text", text: "hello world" }] });
		expect(comp.render(80)).toEqual(["hello world"]);
	});
	it("handles multiline content", () => {
		const comp = renderResult({ content: [{ type: "text", text: "line1" }, { type: "text", text: "line2" }] });
		expect(comp.render(80)).toEqual(["line1", "line2"]);
	});
	it("truncates wide characters in results by visible width", () => {
		const comp = renderResult({ content: [{ type: "text", text: "가위바위보 가위바위보 가위바위보" }] });
		const line = comp.render(10)[0] ?? "";
		expect(visibleWidth(line)).toBeLessThanOrEqual(10);
	});
});
