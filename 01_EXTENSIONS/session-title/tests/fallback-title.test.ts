import { describe, expect, it } from "vitest";
import { buildFallbackTitle } from "../src/fallback-title.ts";

describe("fallback title", () => {
	it("summarizes session and terminal title requests instead of exposing the raw prompt", () => {
		expect(buildFallbackTitle("https://example.com 이거 참고해서 세션 이름? 터미널 제목? 만들어서 설정해주는거 작업해줘. 이름은 좀 더 명료하게 해. extensions에 만들면 됨. 다 만들고 커밋 푸시도 해")).toBe("세션/터미널 제목 자동 설정");
		expect(buildFallbackTitle("Please add session title and terminal title extension.")).toBe("session/terminal title auto sync extension");
		expect(buildFallbackTitle("세션 이름 자동으로 설정해줘")).toBe("세션 제목 자동 설정");
		expect(buildFallbackTitle("세션 제목 extension 만들어줘")).toBe("세션 제목 자동 설정 확장");
		expect(buildFallbackTitle("Please add a session title extension.")).toBe("session title auto naming extension");
		expect(buildFallbackTitle("Please fix API timeout handling in diff-review command.")).toBe("API timeout handling in diff-review command");
		expect(buildFallbackTitle("[docs](https://example.com) Please add a terminal title sync.")).toBe("terminal title sync");
		expect(buildFallbackTitle("터미널 제목 extension 만들어줘")).toBe("터미널 제목 자동 설정 확장");
		expect(buildFallbackTitle("pi에서 ollama glm-5.1 쓰려면 어떻게 해야함")).toBe("pi에서 ollama glm-5.1 사용 방법");
		expect(buildFallbackTitle("glm-5.1 vs gpt-5.4 누가 더 좋음? 레딧에서 사람들 리뷰 봐봐")).toBe("glm-5.1 vs gpt-5.4 레딧 리뷰 비교");
		expect(buildFallbackTitle("claude 4 vs gpt-5 which is better? check reddit reviews")).toBe("claude 4 vs gpt-5 Reddit review comparison");
		expect(buildFallbackTitle("claude 4 vs gpt-5 user reviews")).toBe("claude 4 vs gpt-5 review comparison");
		expect(buildFallbackTitle("claude 4 vs gpt-5")).toBe("claude 4 vs gpt-5 comparison");
		expect(buildFallbackTitle("glm-5.1 vs gpt-5.4 리뷰")).toBe("glm-5.1 vs gpt-5.4 리뷰 비교");
		expect(buildFallbackTitle("glm-5.1 vs gpt-5.4 누가 더 좋음")).toBe("glm-5.1 vs gpt-5.4 비교");
		expect(buildFallbackTitle("claude 4 vs reddit")).toBe("claude 4 vs reddit task");
		expect(buildFallbackTitle("vs gpt-5")).toBe("vs gpt-5 task");
	});

	it("handles empty, question-style, and short prompts without copying them verbatim", () => {
		expect(buildFallbackTitle("   ")).toBe("");
		expect(buildFallbackTitle("go")).toBe("go task");
		expect(buildFallbackTitle("작업해줘")).toBe("");
		expect(buildFallbackTitle("please")).toBe("new session");
		expect(buildFallbackTitle("How do I use Ollama GLM-5.1 in pi?")).toBe("use Ollama GLM-5.1 in pi");
		expect(buildFallbackTitle("ollama api 뭐야")).toBe("ollama api 관련 질문");
		expect(buildFallbackTitle("what is ollama")).toBe("ollama question");
		expect(buildFallbackTitle("뭐야")).toBe("새 세션");
		expect(buildFallbackTitle("how to")).toBe("new session");
		expect(buildFallbackTitle("에러")).toBe("에러 관련 작업");
	});
});
