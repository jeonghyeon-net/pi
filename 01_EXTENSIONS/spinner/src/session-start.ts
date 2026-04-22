import type { ExtensionContext } from "@mariozechner/pi-coding-agent";
import { getSpinnerFrames, SPINNER_INTERVAL_MS } from "./frames.js";

export function onSessionStart(_event: object, ctx: ExtensionContext) {
	if (!ctx.hasUI) return;
	ctx.ui.setWorkingIndicator({
		frames: getSpinnerFrames().map((frame) => ctx.ui.theme.fg("accent", frame)),
		intervalMs: SPINNER_INTERVAL_MS,
	});
}
