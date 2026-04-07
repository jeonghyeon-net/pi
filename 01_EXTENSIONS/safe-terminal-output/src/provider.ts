import type { ProviderConfig } from "@mariozechner/pi-coding-agent";
import { streamSimpleAnthropic, streamSimpleAzureOpenAIResponses, streamSimpleGoogle, streamSimpleGoogleGeminiCli, streamSimpleGoogleVertex, streamSimpleMistral, streamSimpleOpenAICodexResponses, streamSimpleOpenAICompletions, streamSimpleOpenAIResponses, type Api, type AssistantMessageEventStream, type Context, type Model, type SimpleStreamOptions } from "@mariozechner/pi-ai";
import { streamSimpleBedrock } from "../node_modules/@mariozechner/pi-ai/dist/providers/amazon-bedrock.js";
import { wrapStream } from "./stream.js";

type AnyStream = (model: Model<Api>, context: Context, options?: SimpleStreamOptions) => AssistantMessageEventStream;

export const wrappedStreams: Record<string, AnyStream> = {
	"anthropic-messages": wrapStream(streamSimpleAnthropic as AnyStream),
	"azure-openai-responses": wrapStream(streamSimpleAzureOpenAIResponses as AnyStream),
	"bedrock-converse-stream": wrapStream(streamSimpleBedrock as AnyStream),
	"google-generative-ai": wrapStream(streamSimpleGoogle as AnyStream),
	"google-gemini-cli": wrapStream(streamSimpleGoogleGeminiCli as AnyStream),
	"google-vertex": wrapStream(streamSimpleGoogleVertex as AnyStream),
	"mistral-conversations": wrapStream(streamSimpleMistral as AnyStream),
	"openai-codex-responses": wrapStream(streamSimpleOpenAICodexResponses as AnyStream),
	"openai-completions": wrapStream(streamSimpleOpenAICompletions as AnyStream),
	"openai-responses": wrapStream(streamSimpleOpenAIResponses as AnyStream),
};

export function createSafeProviderConfig(api: Api): ProviderConfig {
	const streamSimple = wrappedStreams[api];
	if (!streamSimple) throw new Error(`Unsupported provider api: ${api}`);
	return { api, streamSimple };
}
