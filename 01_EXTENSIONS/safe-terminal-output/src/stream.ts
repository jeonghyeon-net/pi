import { createAssistantMessageEventStream, type Api, type AssistantMessage, type AssistantMessageEventStream, type Context, type Model, type SimpleStreamOptions, type StreamFunction } from "@mariozechner/pi-ai";
import { sanitizeEvent, sanitizeMessage } from "./sanitize.js";

function errorMessage(model: Model<Api>, error: unknown): AssistantMessage {
	return {
		role: "assistant",
		content: [],
		api: model.api,
		provider: model.provider,
		model: model.id,
		usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
		stopReason: "error",
		errorMessage: typeof error === "string" ? error : error instanceof Error ? error.message : String(error),
		timestamp: Date.now(),
	};
}

async function pipe(source: AssistantMessageEventStream, output: AssistantMessageEventStream, model: Model<Api>): Promise<void> {
	let result: AssistantMessage | undefined;
	try {
		for await (const event of source) {
			sanitizeEvent(event);
			output.push(event);
			if (event.type === "done") result = event.message;
			if (event.type === "error") result = event.error;
		}
	} catch (error) {
		result = errorMessage(model, error);
		sanitizeMessage(result);
		output.push({ type: "error", reason: "error", error: result });
	}
	const finalResult = result ?? errorMessage(model, "stream ended without final message");
	sanitizeMessage(finalResult);
	output.end(finalResult);
}

export function wrapStream(base: StreamFunction): StreamFunction {
	return (model: Model<Api>, context: Context, options?: SimpleStreamOptions) => {
		const output = createAssistantMessageEventStream();
		void pipe(base(model, context, options), output, model);
		return output;
	};
}
