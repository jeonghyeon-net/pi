import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ReviewWindowData } from "./types.js";

const here = dirname(fileURLToPath(import.meta.url));
const webDir = join(here, "..", "web");
const scripts = ["state.js", "helpers.js", "protocol.js", "render.js", "app.js"];

function escapeInline(value: string): string {
	return value.replace(/</gu, "\\u003c").replace(/>/gu, "\\u003e").replace(/&/gu, "\\u0026");
}

export function buildReviewHtml(data: ReviewWindowData): string {
	const html = readFileSync(join(webDir, "index.html"), "utf8");
	const css = readFileSync(join(webDir, "style.css"), "utf8");
	const js = scripts.map((file) => readFileSync(join(webDir, file), "utf8")).join("\n");
	return html.replace("__INLINE_STYLE__", css).replace('"__INLINE_DATA__"', escapeInline(JSON.stringify(data))).replace("__INLINE_JS__", js);
}
