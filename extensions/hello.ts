/**
 * 첫 번째 연습용 extension
 *
 * 테스트: pi -e ./extensions/hello.ts
 *
 * 이 extension은 3가지 핵심 기능을 보여줍니다:
 * 1. 커스텀 도구 (LLM이 호출 가능)
 * 2. 슬래시 커맨드 (사용자가 /hello로 호출)
 * 3. 이벤트 핸들러 (세션 시작 시 알림)
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";

export default function (pi: ExtensionAPI) {
	// ─── 1. 이벤트: 세션 시작 시 알림 ───
	pi.on("session_start", async (_event, ctx) => {
		ctx.ui.notify("🧩 Hello extension 로드됨!", "info");
	});

	// ─── 2. 커스텀 도구: LLM이 호출할 수 있는 도구 ───
	pi.registerTool({
		name: "hello",
		label: "Hello",
		description: "이름을 받아 인사하는 도구. 사용자가 인사를 요청하면 이 도구를 사용하세요.",
		parameters: Type.Object({
			name: Type.String({ description: "인사할 대상의 이름" }),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
			const { name } = params as { name: string };
			return {
				content: [{ type: "text", text: `안녕하세요, ${name}님! 반갑습니다 👋` }],
				details: { greeted: name, timestamp: Date.now() },
			};
		},
	});

	// ─── 3. 슬래시 커맨드: /hello로 호출 ───
	pi.registerCommand("hello", {
		description: "인사 메시지 표시",
		handler: async (args, ctx) => {
			const name = args?.trim() || "세계";
			ctx.ui.notify(`👋 안녕하세요, ${name}!`, "info");
		},
	});
}
