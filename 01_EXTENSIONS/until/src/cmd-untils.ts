import type { ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import type { SendMessageFn } from "./types.js";
import { CUSTOM_TYPE } from "./constants.js";
import { formatKoreanDuration } from "./time-utils.js";
import { getTasks, sendMessage } from "./state.js";

export function createUntilsCommand(_sendMsg: SendMessageFn) {
	return {
		description: "활성 until 목록 보기",
		handler: async (_args: string, ctx: ExtensionCommandContext) => {
			const tasks = getTasks();
			if (tasks.size === 0) {
				ctx.ui.notify("활성 until 작업이 없어.", "info");
				return;
			}
			const now = Date.now();
			const lines = [...tasks.values()]
				.sort((a, b) => a.nextRunAt - b.nextRunAt)
				.map((t) => {
					const remain = formatKoreanDuration(Math.max(0, t.nextRunAt - now));
					const elapsed = formatKoreanDuration(now - t.createdAt);
					const summary = t.lastSummary ? `\n     최근: ${t.lastSummary}` : "";
					return `  #${t.id} · ${t.intervalLabel}마다 · 실행 ${t.runCount}회 · 경과 ${elapsed} · 다음 ${remain} 후${summary}\n     ${t.prompt}`;
				});
			sendMessage({
				customType: CUSTOM_TYPE,
				content: `활성 until 목록 (${tasks.size}개)\n\n${lines.join("\n\n")}`,
				display: true,
			});
		},
	};
}
