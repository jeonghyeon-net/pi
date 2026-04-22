import { stripAnsi } from "./ansi.js";
import { resolveFromModule } from "./internal-module.js";

type MessageState = { content: Array<{ type: string; text?: string; thinking?: string }> };
type AssistantPrototype = {
	render(width: number): string[];
	hideThinkingBlock?: boolean;
	hiddenThinkingLabel?: string;
	lastMessage?: MessageState;
	__claudeCodeUiPatched?: boolean;
};

type AssistantModule = { AssistantMessageComponent?: { prototype?: AssistantPrototype } };
type AssistantLoader = () => Promise<AssistantModule>;

function trim(lines: string[]) {
	/* v8 ignore next */
	while (lines.length && !stripAnsi(lines[0] ?? "").trim()) lines.shift();
	/* v8 ignore next */
	while (lines.length && !stripAnsi(lines.at(-1) ?? "").trim()) lines.pop();
	return lines;
}

function hasVisibleText(message?: MessageState) {
	/* v8 ignore next */
	if (!message) return false;
	for (const content of message.content) if (content.type === "text" && content.text?.trim()) return true;
	return false;
}

function hasHiddenThinking(message?: MessageState) {
	/* v8 ignore next */
	if (!message) return false;
	for (const content of message.content) if (content.type === "thinking" && content.thinking?.trim()) return true;
	return false;
}

export function patchAssistantMessagePrototype(prototype?: AssistantPrototype) {
	if (!prototype || prototype.__claudeCodeUiPatched) return false;
	const render = prototype.render;
	prototype.render = function renderPatched(width) {
		const lines = trim(render.call(this, width));
		const hiddenLabel = this.hiddenThinkingLabel?.trim();
		const hasText = hasVisibleText(this.lastMessage);
		const shouldHide = this.hideThinkingBlock && !hiddenLabel && hasHiddenThinking(this.lastMessage);
		return shouldHide && !hasText && !lines.length ? [] : lines;
	};
	prototype.__claudeCodeUiPatched = true;
	return true;
}

/* v8 ignore next 4 */
async function loadAssistantMessageModule() {
	const main = import.meta.resolve("@mariozechner/pi-coding-agent");
	return import(resolveFromModule(main, "modes/interactive/components/assistant-message.js"));
}

export async function applyAssistantMessagePatch(load: AssistantLoader = loadAssistantMessageModule) {
	const module = await load();
	patchAssistantMessagePrototype(module.AssistantMessageComponent?.prototype);
}
