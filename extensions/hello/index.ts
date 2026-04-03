import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";

export default function (pi: ExtensionAPI) {
	pi.registerTool({
		name: "hello",
		label: "Hello",
		description: "이름을 받아 인사하는 도구",
		parameters: Type.Object({
			name: Type.String({ description: "인사할 대상의 이름" }),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
			const { name } = params as { name: string };
			return {
				content: [{ type: "text", text: `Hello, ${name}!` }],
				details: {},
			};
		},
	});
}
