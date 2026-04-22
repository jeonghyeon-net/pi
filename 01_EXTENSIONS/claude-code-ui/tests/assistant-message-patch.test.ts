import { describe, expect, it } from "vitest";
import { stripAnsi } from "../src/ansi.ts";
import { applyAssistantMessagePatch, patchAssistantMessagePrototype } from "../src/assistant-message-patch.ts";

class BlankThinkingMessage {
	hideThinkingBlock = true;
	hiddenThinkingLabel = "";
	lastMessage = { content: [{ type: "thinking", thinking: "reasoning" }] };
	render() {
		return ["\x1b]133;A\u0007", "\x1b]133;B\u0007"];
	}
}

describe("assistant message patch", () => {
	it("suppresses blank hidden-thinking rows", async () => {
		expect(patchAssistantMessagePrototype()).toBe(false);
		expect(patchAssistantMessagePrototype(BlankThinkingMessage.prototype)).toBe(true);
		expect(new BlankThinkingMessage().render()).toEqual([]);
		expect(patchAssistantMessagePrototype(BlankThinkingMessage.prototype)).toBe(false);
		await applyAssistantMessagePatch(async () => ({}));
	});

	it("keeps visible assistant text and supports injected loaders", async () => {
		class VisibleTextMessage extends BlankThinkingMessage {
			lastMessage = { content: [{ type: "text", text: "hello" }, { type: "thinking", thinking: "reasoning" }] };
			render() {
				return ["hello"];
			}
		}
		class HiddenLabelMessage extends BlankThinkingMessage { hiddenThinkingLabel = "reasoning"; }
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
		expect(patchAssistantMessagePrototype(VisibleThinkingLines.prototype)).toBe(true);
		await applyAssistantMessagePatch(async () => ({ AssistantMessageComponent: LoadedMessage }));
		expect(new LoadedMessage().render()).toEqual([]);
		expect(new VisibleTextMessage().render()).toEqual(["hello"]);
		expect(stripAnsi(new HiddenLabelMessage().render().join(""))).toBe("");
		expect(stripAnsi(new MissingMessage().render().join(""))).toBe("");
		expect(stripAnsi(new TextOnlyMessage().render().join(""))).toBe("");
		expect(new VisibleThinkingLines().render()).toEqual(["Thinking..."]);
	});
});
