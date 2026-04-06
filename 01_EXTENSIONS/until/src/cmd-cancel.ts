import type { ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import { getTasks, getTask, deleteTask, clearAllTasks } from "./state.js";

export function createCancelCommand() {
	return {
		description: "until 취소. 사용법: /until-cancel <id|all>",
		handler: async (args: string, ctx: ExtensionCommandContext) => {
			const raw = args.trim().toLowerCase();
			if (!raw) {
				ctx.ui.notify("사용법: /until-cancel <id|all>", "info");
				return;
			}
			if (raw === "all") {
				const count = getTasks().size;
				clearAllTasks();
				ctx.ui.notify(`until ${count}개 취소됨`, "info");
				return;
			}
			const id = Number(raw);
			if (!Number.isInteger(id)) {
				ctx.ui.notify("id는 숫자여야 해. 예: /until-cancel 3", "warning");
				return;
			}
			if (!getTask(id)) {
				ctx.ui.notify(`until #${id} 없음`, "warning");
				return;
			}
			deleteTask(id);
			ctx.ui.notify(`until #${id} 취소됨`, "info");
		},
	};
}
