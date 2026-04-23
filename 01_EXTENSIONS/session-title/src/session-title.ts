import type { ExtensionContext } from "@mariozechner/pi-coding-agent";
import { extractSessionTitleContext } from "./title-context.js";
import { generateSessionTitle } from "./title-generator.js";
import { getSessionTitle, shouldAutoNameSession, shouldReplaceSessionTitle } from "./session-title-state.js";
import { clearSessionTitleUi, syncSessionTitleUi } from "./session-title-ui.js";
import type { SessionTitleApi } from "./types.js";
import type { SessionTitleContext } from "./title-context.js";

function getSessionKey(ctx: ExtensionContext): string {
	try {
		return ctx.sessionManager.getSessionFile() ?? ctx.cwd;
	} catch {
		return ctx.cwd;
	}
}

export default function registerSessionTitle(_pi: SessionTitleApi) {
	let namingInFlight = false;
	const autoTitleBySession = new Map<string, string>();

	const maybeUpdateTitle = async (
		ctx: ExtensionContext,
		input: string | SessionTitleContext,
		shouldRun: boolean,
		shouldApply: (currentTitle: string | undefined) => boolean,
	) => {
		if (!shouldRun) {
			syncSessionTitleUi(_pi, ctx);
			return;
		}
		namingInFlight = true;
		try {
			const sessionTitle = await generateSessionTitle(ctx, input);
			const currentTitle = getSessionTitle(_pi, ctx);
			if (sessionTitle && sessionTitle !== currentTitle && shouldApply(currentTitle)) {
				_pi.setSessionName(sessionTitle);
				autoTitleBySession.set(getSessionKey(ctx), sessionTitle);
			}
		} finally {
			namingInFlight = false;
			syncSessionTitleUi(_pi, ctx);
		}
	};

	const maybeAutoNameFromPrompt = async (userPrompt: string, ctx: ExtensionContext) => {
		if (!shouldAutoNameSession(_pi, ctx, userPrompt, namingInFlight)) {
			syncSessionTitleUi(_pi, ctx);
			return;
		}
		const context = extractSessionTitleContext(ctx.sessionManager, getSessionTitle(_pi, ctx), userPrompt);
		await maybeUpdateTitle(ctx, context, true, (currentTitle) => shouldReplaceSessionTitle(currentTitle, userPrompt));
	};

	const maybeRefreshTitleFromContext = async (ctx: ExtensionContext) => {
		const currentTitle = getSessionTitle(_pi, ctx);
		const context = extractSessionTitleContext(ctx.sessionManager, currentTitle);
		const sessionKey = getSessionKey(ctx);
		const latestAutoTitle = autoTitleBySession.get(sessionKey);
		const promptForReplacement = context.recentUserPrompts.at(-1) ?? "";
		const canRefresh = (title: string | undefined) =>
			(!!latestAutoTitle && latestAutoTitle === title) || shouldReplaceSessionTitle(title, promptForReplacement);
		const shouldRun = !namingInFlight && canRefresh(currentTitle);
		await maybeUpdateTitle(ctx, context, shouldRun, canRefresh);
	};

	_pi.on("session_start", (_event, ctx) => syncSessionTitleUi(_pi, ctx));
	_pi.on("before_agent_start", (event, ctx) => maybeAutoNameFromPrompt(event.prompt, ctx));
	_pi.on("session_tree", (_event, ctx) => syncSessionTitleUi(_pi, ctx));
	_pi.on("agent_end", (_event, ctx) => maybeRefreshTitleFromContext(ctx));
	_pi.on("session_shutdown", (_event, ctx) => {
		autoTitleBySession.delete(getSessionKey(ctx));
		clearSessionTitleUi(ctx);
	});
}
