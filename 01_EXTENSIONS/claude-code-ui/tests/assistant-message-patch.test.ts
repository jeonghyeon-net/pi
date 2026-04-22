import { describe, expect, it } from "vitest";
import { applyAssistantMessagePatch, patchAssistantMessagePrototype } from "../src/assistant-message-patch.ts";

class BlankThinkingMessage {
	hideThinkingBlock = true;
	hiddenThinkingLabel = "";
	lastMessage = { content: [{ type: "thinking", thinking: "reasoning" }] };
	render() {
		return ["", ""];
	}
}

describe("assistant message patch", () => {
	it("suppresses blank hidden-thinking rows", async () => {
		expect(patchAssistantMessagePrototype()).toBe(false);
		expect(patchAssistantMessagePrototype(BlankThinkingMessage.prototype)).toBe(true);
		expect(new BlankThinkingMessage().render()).toEqual([]);
		expect(patchAssistantMessagePrototype(BlankThinkingMessage.prototype)).toBe(false);
		await applyAssistantMessagePatch(async () => ({}));
		await applyAssistantMessagePatch();
	});

	it("keeps visible assistant text and supports injected loaders", async () => {
		class HiddenLabelMessage extends BlankThinkingMessage {
			hiddenThinkingLabel = "reasoning";
		}
		class MissingMessage extends BlankThinkingMessage { lastMessage = undefined; }
		class TextOnlyMessage extends BlankThinkingMessage { lastMessage = { content: [{ type: "text", text: "hello" }] }; }
		class VisibleThinkingLines {
			hideThinkingBlock = true;
			hiddenThinkingLabel = "";
			lastMessage = { content: [{ type: "thinking", thinking: "reasoning" }] };
			render() {
				return ["Thinking..."];
			}
		}
		class LoadedMessage extends BlankThinkingMessage {}
		const visibleText = new BlankThinkingMessage();
		visibleText.lastMessage = { content: [{ type: "text", text: "hello" }, { type: "thinking", thinking: "reasoning" }] };
		expect(patchAssistantMessagePrototype(VisibleThinkingLines.prototype)).toBe(true);
		await applyAssistantMessagePatch(async () => ({ AssistantMessageComponent: LoadedMessage }));
		expect(new LoadedMessage().render()).toEqual([]);
		expect(visibleText.render()).toEqual(["", ""]);
		expect(new HiddenLabelMessage().render()).toEqual(["", ""]);
		expect(new MissingMessage().render()).toEqual(["", ""]);
		expect(new TextOnlyMessage().render()).toEqual(["", ""]);
		expect(new VisibleThinkingLines().render()).toEqual(["Thinking..."]);
	});
});
