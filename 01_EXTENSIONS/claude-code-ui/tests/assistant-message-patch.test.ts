import { describe, expect, it } from "vitest";
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
	it("suppresses hidden reasoning placeholders", async () => {
		expect(patchAssistantMessagePrototype()).toBe(false);
		expect(patchAssistantMessagePrototype(BlankThinkingMessage.prototype)).toBe(true);
		expect(new BlankThinkingMessage().render()).toEqual([]);
		expect(patchAssistantMessagePrototype(BlankThinkingMessage.prototype)).toBe(false);
		await applyAssistantMessagePatch(async () => ({}));
	});

	it("keeps a single spacer before visible assistant text", async () => {
		class LeadingGapMessage {
			hideThinkingBlock = true;
			hiddenThinkingLabel = "";
			lastMessage = { content: [{ type: "text", text: "hello" }] };
			render() {
				return ["", "hello", ""];
			}
		}
		class VisibleThinkingLines {
			hideThinkingBlock = true;
			hiddenThinkingLabel = "";
			lastMessage = { content: [{ type: "thinking", thinking: "reasoning" }] };
			render() {
				return ["Thinking..."];
			}
		}
		class MissingMessage {
			hideThinkingBlock = true;
			hiddenThinkingLabel = "";
			render() {
				return [];
			}
		}
		class LoadedMessage {
			hideThinkingBlock = true;
			hiddenThinkingLabel = "";
			lastMessage = { content: [{ type: "thinking", thinking: "reasoning" }] };
			render() {
				return ["\x1b]133;A\u0007", "\x1b]133;B\u0007"];
			}
		}
		expect(patchAssistantMessagePrototype(LeadingGapMessage.prototype)).toBe(true);
		expect(patchAssistantMessagePrototype(VisibleThinkingLines.prototype)).toBe(true);
		await applyAssistantMessagePatch(async () => ({ AssistantMessageComponent: LoadedMessage }));
		expect(new LoadedMessage().render()).toEqual([]);
		expect(new LeadingGapMessage().render()).toEqual(["", "hello"]);
		expect(new MissingMessage().render()).toEqual([]);
		expect(new VisibleThinkingLines().render()).toEqual(["Thinking..."]);
	});
});
