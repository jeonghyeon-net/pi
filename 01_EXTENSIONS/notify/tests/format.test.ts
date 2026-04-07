import { describe, expect, it } from "vitest";
import { buildCompletionNotification, normalizeSingleSummary, summarizeNotificationBody } from "../src/format.js";
import { sanitizeNotificationText } from "../src/text.js";

describe("notify formatting", () => {
	it("builds a compact completion notification", () => {
		expect(buildCompletionNotification()).toEqual({ title: "π", body: "" });
		expect(buildCompletionNotification("Fix auth tests", [{
			role: "assistant",
			content: [{ type: "toolCall" }, { type: "text", text: "- Updated auth flow. Added regression tests too." }],
		}])).toEqual({ title: "Fix auth tests", body: "" });
		expect(buildCompletionNotification("  \n;\t ", [{ role: "assistant", content: "로그인 문구 수정 완료" }])).toEqual({
			title: "π",
			body: "로그인 문구 수정 완료",
		});
		expect(buildCompletionNotification("로그인 문구 수정", [{ role: "assistant", content: "로그인 문구 수정 완료" }])).toEqual({
			title: "로그인 문구 수정",
			body: "",
		});
		expect(buildCompletionNotification("서브에이전트 2개로 가위바위보 실행", [{
			role: "assistant",
			content: "서브에이전트 2개로 가위바위보 실행 서브에이전트 두 명이 모두 가위를 내 무승부로 끝났어",
		}])).toEqual({
			title: "서브에이전트 2개로 가위바위보 실행",
			body: "서브에이전트 두 명이 모두 가위를 내 무승부로 끝났어",
		});
	});

	it("falls back for empty assistant output", () => {
		expect(buildCompletionNotification("notify", [{ role: "assistant", content: [{ type: "toolCall" }] }])).toEqual({
			title: "notify",
			body: "",
		});
		expect(buildCompletionNotification("notify", [
			{ role: "assistant", content: "로그인 문구 수정 완료" },
			{ role: "assistant", content: "   " },
		])).toEqual({ title: "notify", body: "로그인 문구 수정 완료" });
		expect(buildCompletionNotification("notify", [{ role: "user", content: "ignore me" }, { role: "assistant" }])).toEqual({
			title: "notify",
			body: "",
		});
	});

	it("keeps only a single plain summary line", () => {
		expect(summarizeNotificationBody("## Done\n- Fixed login title\n- Added tests")).toBe("Fixed login title");
		expect(summarizeNotificationBody("요약\n- 로그인 수정\n- 테스트 추가")).toBe("로그인 수정");
		expect(summarizeNotificationBody("Fixed login, added tests")).toBe("Fixed login, added tests");
		expect(summarizeNotificationBody("First result\nSecond result")).toBe("First result");
		expect(summarizeNotificationBody("요약:   ")).toBe("");
	});

	it("normalizes generated summaries", () => {
		expect(normalizeSingleSummary("요약: 로그인 수정 완료\n테스트 추가")).toBe("로그인 수정 완료");
		expect(normalizeSingleSummary("result: fixed auth title")).toBe("fixed auth title");
		expect(normalizeSingleSummary("요약:   ")).toBeUndefined();
		expect(normalizeSingleSummary("   \n...\n")).toBeUndefined();
	});

	it("sanitizes plain text", () => {
		expect(sanitizeNotificationText("  hi\nthere;\t ")).toBe("hi there");
		expect(summarizeNotificationBody("", 20)).toBe("");
		expect(summarizeNotificationBody("This notification should truncate nicely without cutting a word awkwardly", 40)).toBe("This notification should truncate…");
		expect(summarizeNotificationBody("Supercalifragilisticexpialidociousplusmore", 20)).toBe("Supercalifragilisti…");
	});
});
