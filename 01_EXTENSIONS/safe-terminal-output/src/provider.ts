import { streamSimpleAnthropic, streamSimpleAzureOpenAIResponses, streamSimpleGoogle, streamSimpleGoogleGeminiCli, streamSimpleGoogleVertex, streamSimpleMistral, streamSimpleOpenAICodexResponses, streamSimpleOpenAICompletions, streamSimpleOpenAIResponses, type Api, type AssistantMessageEventStream, type Context, type Model, type SimpleStreamOptions } from "@mariozechner/pi-ai";
import { streamSimpleBedrock } from "../node_modules/@mariozechner/pi-ai/dist/providers/amazon-bedrock.js";
import { wrapStream } from "./stream.js";

type AnyStream = (model: Model<Api>, context: Context, options?: SimpleStreamOptions) => AssistantMessageEventStream;

const baseStreams: Record<string, AnyStream> = {
	"anthropic-messages": streamSimpleAnthropic as AnyStream,
	"azure-openai-responses": streamSimpleAzureOpenAIResponses as AnyStream,
	"bedrock-converse-stream": streamSimpleBedrock as AnyStream,
	"google-generative-ai": streamSimpleGoogle as AnyStream,
	"google-gemini-cli": streamSimpleGoogleGeminiCli as AnyStream,
	"google-vertex": streamSimpleGoogleVertex as AnyStream,
	"mistral-conversations": streamSimpleMistral as AnyStream,
	"openai-codex-responses": streamSimpleOpenAICodexResponses as AnyStream,
	"openai-completions": streamSimpleOpenAICompletions as AnyStream,
	"openai-responses": streamSimpleOpenAIResponses as AnyStream,
};
const wrappedStreams = Object.fromEntries(Object.entries(baseStreams).map(([api, stream]) => [api, wrapStream(stream)])) as Record<string, AnyStream>;

export const safeProviderConfig = {
	streamSimple(model: Model<Api>, context: Context, options?: SimpleStreamOptions) {
		const stream = wrappedStreams[model.api];
		if (!stream) throw new Error(`Unsupported provider api: ${model.api}`);
		return stream(model, context, options);
	},
};

export function createSafeProviderConfig() {
	return safeProviderConfig;
}
