import { stripAnsi } from "./ansi.js";
import { resolvePackageFile } from "./internal-module.js";

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

function hasVisibleText(message?: MessageState) {
	if (!message) return false;
	for (const content of message.content) {
		if (content.type === "text" && content.text?.trim()) return true;
	}
	return false;
}

function hasHiddenThinking(message?: MessageState) {
	if (!message) return false;
	for (const content of message.content) {
		if (content.type === "thinking" && content.thinking?.trim()) return true;
	}
	return false;
}

export function patchAssistantMessagePrototype(prototype?: AssistantPrototype) {
	if (!prototype || prototype.__claudeCodeUiPatched) return false;
	const render = prototype.render;
	prototype.render = function renderPatched(width) {
		const lines = render.call(this, width);
		const hiddenLabel = this.hiddenThinkingLabel?.trim();
		const hasText = hasVisibleText(this.lastMessage);
		const shouldHide = this.hideThinkingBlock && !hiddenLabel && hasHiddenThinking(this.lastMessage);
		if (!shouldHide || hasText) return lines;
		return lines.every((line) => !stripAnsi(line).trim()) ? [] : lines;
	};
	prototype.__claudeCodeUiPatched = true;
	return true;
}

async function loadAssistantMessageModule() {
	return import(resolvePackageFile("@mariozechner/pi-coding-agent", "dist/modes/interactive/components/assistant-message.js"));
}

export async function applyAssistantMessagePatch(load: AssistantLoader = loadAssistantMessageModule) {
	const module = await load();
	patchAssistantMessagePrototype(module.AssistantMessageComponent?.prototype);
}
