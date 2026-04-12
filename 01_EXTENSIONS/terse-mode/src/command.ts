import type { ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import { isEnabled, setEnabled } from "./state.js";

interface CommandDef {
	description: string;
	handler: (args: string, ctx: ExtensionCommandContext) => Promise<void>;
}

type NotifyLevel = "info" | "warning" | "error";
type NotifyFn = (message: string, type?: NotifyLevel) => void;
type SaveStateFn = (enabled: boolean) => Promise<void>;

export function createTerseCommand(saveState: SaveStateFn): CommandDef {
	return {
		description: "짧은 응답 스타일 제어. 사용법: /terse on|off|status|toggle",
		handler: async (args: string, ctx: ExtensionCommandContext) => {
			const action = normalizeAction(args);
			if (action === "status") return notifyStatus(ctx.ui.notify.bind(ctx.ui));
			if (action === "on") return applyState(true, saveState, ctx.ui.notify.bind(ctx.ui));
			if (action === "off") return applyState(false, saveState, ctx.ui.notify.bind(ctx.ui));
			if (action === "toggle") return applyState(!isEnabled(), saveState, ctx.ui.notify.bind(ctx.ui));
			ctx.ui.notify("사용법: /terse on|off|status|toggle", "warning");
		},
	};
}

function normalizeAction(raw: string): string {
	const trimmed = raw.trim().toLowerCase();
	return trimmed || "status";
}

async function applyState(next: boolean, saveState: SaveStateFn, notify: NotifyFn): Promise<void> {
	const previous = isEnabled();
	const changed = setEnabled(next);
	if (!changed) return notify(next ? "terse mode 이미 켜져 있어." : "terse mode 이미 꺼져 있어.", "info");
	try {
		await saveState(next);
		notify(next ? "terse mode 켰어. 새 세션에도 유지돼." : "terse mode 껐어. 새 세션에도 유지돼.", "info");
	} catch {
		setEnabled(previous);
		notify("terse mode 상태 저장 실패. 기존 값으로 유지했어.", "error");
	}
}

function notifyStatus(notify: NotifyFn): void {
	notify(isEnabled() ? "terse mode 현재 켜짐." : "terse mode 현재 꺼짐.", "info");
}
