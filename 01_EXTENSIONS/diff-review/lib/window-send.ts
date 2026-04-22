import type { ReviewHostMessage } from "../src/types.js";
import type { QuietGlimpseWindow } from "./glimpse-window.js";

export function sendWindowMessage(window: QuietGlimpseWindow, message: ReviewHostMessage): void {
	const payload = JSON.stringify(message).replace(/</gu, "\\u003c").replace(/>/gu, "\\u003e").replace(/&/gu, "\\u0026");
	window.send(`window.__reviewReceive(${payload});`);
}
