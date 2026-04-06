import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { installFooter, teardownFooter } from "./footer.js";

export default function (pi: ExtensionAPI) {
	pi.on("session_start", async (_event, ctx) => installFooter(ctx, (c, a, o) => pi.exec(c, a, o)));
	pi.on("session_tree", async (_event, ctx) => installFooter(ctx, (c, a, o) => pi.exec(c, a, o)));
	pi.on("session_shutdown", async (_event, ctx) => teardownFooter(ctx));
}
