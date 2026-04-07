import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { safeProviderConfig } from "./provider.js";

export default function (pi: ExtensionAPI) {
	pi.registerProvider("amazon-bedrock", safeProviderConfig);
	pi.registerProvider("anthropic", safeProviderConfig);
	pi.registerProvider("azure-openai-responses", safeProviderConfig);
	pi.registerProvider("cerebras", safeProviderConfig);
	pi.registerProvider("github-copilot", safeProviderConfig);
	pi.registerProvider("google", safeProviderConfig);
	pi.registerProvider("google-antigravity", safeProviderConfig);
	pi.registerProvider("google-gemini-cli", safeProviderConfig);
	pi.registerProvider("google-vertex", safeProviderConfig);
	pi.registerProvider("groq", safeProviderConfig);
	pi.registerProvider("huggingface", safeProviderConfig);
	pi.registerProvider("kimi-coding", safeProviderConfig);
	pi.registerProvider("minimax", safeProviderConfig);
	pi.registerProvider("minimax-cn", safeProviderConfig);
	pi.registerProvider("mistral", safeProviderConfig);
	pi.registerProvider("opencode", safeProviderConfig);
	pi.registerProvider("opencode-go", safeProviderConfig);
	pi.registerProvider("openai", safeProviderConfig);
	pi.registerProvider("openai-codex", safeProviderConfig);
	pi.registerProvider("openrouter", safeProviderConfig);
	pi.registerProvider("vercel-ai-gateway", safeProviderConfig);
	pi.registerProvider("xai", safeProviderConfig);
	pi.registerProvider("zai", safeProviderConfig);
}
