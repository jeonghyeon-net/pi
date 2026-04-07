import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { createSafeProviderConfig } from "./provider.js";

export default function (pi: ExtensionAPI) {
	pi.registerProvider("safe-terminal-output-anthropic-messages", createSafeProviderConfig("anthropic-messages"));
	pi.registerProvider("safe-terminal-output-azure-openai-responses", createSafeProviderConfig("azure-openai-responses"));
	pi.registerProvider("safe-terminal-output-bedrock-converse-stream", createSafeProviderConfig("bedrock-converse-stream"));
	pi.registerProvider("safe-terminal-output-google-generative-ai", createSafeProviderConfig("google-generative-ai"));
	pi.registerProvider("safe-terminal-output-google-gemini-cli", createSafeProviderConfig("google-gemini-cli"));
	pi.registerProvider("safe-terminal-output-google-vertex", createSafeProviderConfig("google-vertex"));
	pi.registerProvider("safe-terminal-output-mistral-conversations", createSafeProviderConfig("mistral-conversations"));
	pi.registerProvider("safe-terminal-output-openai-codex-responses", createSafeProviderConfig("openai-codex-responses"));
	pi.registerProvider("safe-terminal-output-openai-completions", createSafeProviderConfig("openai-completions"));
	pi.registerProvider("safe-terminal-output-openai-responses", createSafeProviderConfig("openai-responses"));
}
