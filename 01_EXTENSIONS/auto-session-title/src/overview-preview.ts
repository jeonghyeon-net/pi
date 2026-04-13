import { findLatestOverview } from "./overview-entry.js";
import { syncOverviewUi } from "./overview-ui.js";
import { buildTerminalTitle, normalizeTitle } from "./title.js";
import type { OverviewContext, SessionOverview } from "./overview-types.js";

function collapseWhitespace(text: string): string {
	return text.replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim();
}

function isRoutineInput(text: string): boolean {
	return /^(?:안녕(?:하세요)?|반가워(?:요)?|hi|hello|hey|thanks|thank you|고마워(?:요)?|감사(?:합니다|해요)?)$/iu.test(text.replace(/[.!?~]+$/u, ""));
}

function stripRequestNoise(text: string): string {
	let request = collapseWhitespace(text).replace(/^(?:그리고|근데|그런데|야|이거|저기|아|어|음|and then|also)\s+/iu, "");
	if (!/^hello(?:,\s*|\s+)world\b/iu.test(request) && /^(?:hello|hi|hey)(?:\s+there)?\b/iu.test(request) && (/(?:,\s*)?please[.!?~]*$/iu.test(request) || /(?:can|could|would|will)\s+you\b/iu.test(request))) {
		request = request.replace(/^(?:hello|hi|hey)(?:\s+there)?(?:[,!.:;-]\s*|\s+)/iu, "");
	}
	return request
		.replace(/^please\s+/iu, "")
		.replace(/^(?:can|could|would|will)\s+you(?:\s+please)?\s+/iu, "")
		.replace(/[.!?~]+$/u, "")
		.replace(/([가-힣]+?)해(?:줘|주세요|봐|줄래)\s*$/u, "$1")
		.replace(/(?:해줘|해주세요|해봐|시켜봐|봐줘|보여줘|고쳐줘|넣어줘|바꿔줘|만들어줘|해줄래|부탁해|(?:,\s*)?please)\s*$/iu, "")
		.replace(/[.!?~]+$/u, "")
		.trim();
}

function buildPreviewSummary(_title: string, _request: string): string[] {
	return [];
}

function buildPreviewOverview(text: string): SessionOverview | undefined {
	const request = stripRequestNoise((text.replace(/```[\s\S]*?```/g, " ").split(/\r?\n\s*\r?\n/).find((part) => part.trim()) ?? ""));
	if (!request || request.startsWith("/") || request.startsWith("!") || isRoutineInput(request)) return undefined;
	const title = normalizeTitle(request);
	return title ? { title, summary: buildPreviewSummary(title, request) } : undefined;
}

function syncTitle(ctx: OverviewContext, title: string): void {
	if (ctx.hasUI) ctx.ui.setTitle(buildTerminalTitle(title));
}

export function previewOverviewFromInput(ctx: OverviewContext, text: string): boolean {
	if (findLatestOverview(ctx.sessionManager.getBranch())) return false;
	const preview = buildPreviewOverview(text);
	if (!preview) return false;
	syncOverviewUi(ctx, preview, preview.title);
	syncTitle(ctx, preview.title);
	return true;
}
