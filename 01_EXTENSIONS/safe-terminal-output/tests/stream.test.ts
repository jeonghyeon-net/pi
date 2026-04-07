import { createAssistantMessageEventStream, type AssistantMessage, type Context, type Model, type StreamFunction } from "@mariozechner/pi-ai";
import { describe, expect, it } from "vitest";
import { wrapStream } from "../src/stream.js";

function makeMessage(text: string): AssistantMessage {
	return { role: "assistant", content: [{ type: "text", text }], api: "openai-completions", provider: "openai", model: "gpt", usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } }, stopReason: "stop", timestamp: 0 };
}

const model = { api: "openai-completions", provider: "openai", id: "gpt" } as Model<"openai-completions">;
const context = {} as Context;

describe("wrapStream", () => {
	it("sanitizes streamed events", async () => {
		const base: StreamFunction = () => {
			const stream = createAssistantMessageEventStream();
			const partial = makeMessage("hi😀");
			stream.push({ type: "start", partial });
			stream.push({ type: "text_delta", contentIndex: 0, delta: "A😀", partial });
			stream.push({ type: "done", reason: "stop", message: makeMessage("bye\u200D") });
			stream.end(makeMessage("bye\u200D"));
			return stream;
		};
		const result = wrapStream(base)(model, context);
		const seen: string[] = [];
		for await (const event of result) {
			if (event.type === "text_delta") seen.push(event.delta);
			if (event.type === "start") seen.push(event.partial.content[0].type === "text" ? event.partial.content[0].text : "");
			if (event.type === "done") seen.push(event.message.content[0].type === "text" ? event.message.content[0].text : "");
		}
		expect(seen).toEqual(["hi😀", "A😀", "bye"]);
		expect((await result.result()).content[0]).toEqual({ type: "text", text: "bye" });
	});

	it("preserves error results for wrapped streams", async () => {
		const base: StreamFunction = () => {
			const stream = createAssistantMessageEventStream();
			stream.push({ type: "error", reason: "error", error: makeMessage("oops😀") });
			stream.end(makeMessage("oops😀"));
			return stream;
		};
		const result = wrapStream(base)(model, context);
		for await (const _event of result) {}
		expect((await result.result()).content[0]).toEqual({ type: "text", text: "oops😀" });
	});

	it("converts source failures into an error result", async () => {
		const base: StreamFunction = () => ({
			async *[Symbol.asyncIterator]() { throw new Error("bad😀"); },
			push() {}, end() {}, result: async () => makeMessage("never"),
		}) as ReturnType<StreamFunction>;
		const result = wrapStream(base)(model, context);
		const seen: string[] = [];
		for await (const event of result) if (event.type === "error") seen.push(event.error.errorMessage || "");
		expect(seen).toEqual(["bad😀"]);
		expect((await result.result()).errorMessage).toBe("bad😀");
	});

	it("emits a fallback error when the source ends without a final message", async () => {
		const base: StreamFunction = () => {
			const stream = createAssistantMessageEventStream();
			stream.end();
			return stream;
		};
		const result = wrapStream(base)(model, context);
		expect((await result.result()).errorMessage).toBe("stream ended without final message");
	});

	it("stringifies non-Error failures", async () => {
		const base: StreamFunction = () => ({
			async *[Symbol.asyncIterator]() { throw 7; },
			push() {}, end() {}, result: async () => makeMessage("never"),
		}) as ReturnType<StreamFunction>;
		const result = wrapStream(base)(model, context);
		for await (const _event of result) {}
		expect((await result.result()).errorMessage).toBe("7");
	});
});
