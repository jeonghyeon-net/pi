import { describe, expect, it, vi } from "vitest";

const anthropicBase = vi.fn(() => "anthropic-stream");
const bedrockBase = vi.fn(() => "bedrock-stream");
const wrapStream = vi.fn((base: (model: unknown) => unknown) => (model: unknown) => String(base(model)));

vi.mock("@mariozechner/pi-ai", () => ({
	streamSimpleAnthropic: anthropicBase,
	streamSimpleAzureOpenAIResponses: vi.fn(),
	streamSimpleGoogle: vi.fn(),
	streamSimpleGoogleGeminiCli: vi.fn(),
	streamSimpleGoogleVertex: vi.fn(),
	streamSimpleMistral: vi.fn(),
	streamSimpleOpenAICodexResponses: vi.fn(),
	streamSimpleOpenAICompletions: vi.fn(),
	streamSimpleOpenAIResponses: vi.fn(),
}));
vi.mock("../node_modules/@mariozechner/pi-ai/dist/providers/amazon-bedrock.js", () => ({ streamSimpleBedrock: bedrockBase }));
vi.mock("../src/stream.js", () => ({ wrapStream }));

const mod = await import("../src/provider.js");

describe("provider", () => {
	it("pre-wraps built-in streams once at module load", () => {
		expect(wrapStream).toHaveBeenCalledWith(anthropicBase);
		expect(wrapStream).toHaveBeenCalledWith(bedrockBase);
	});

	it("creates a provider config pinned to one api", () => {
		const config = mod.createSafeProviderConfig("anthropic-messages");
		expect(config.api).toBe("anthropic-messages");
		expect(config.streamSimple({ api: "anthropic-messages" }, {}, undefined)).toBe("anthropic-stream");
	});

	it("uses the wrapped stream for the requested api", () => {
		const config = mod.createSafeProviderConfig("bedrock-converse-stream");
		expect(config.streamSimple({ api: "bedrock-converse-stream" }, {}, undefined)).toBe("bedrock-stream");
	});

	it("throws for unsupported APIs", () => {
		expect(() => mod.createSafeProviderConfig("unknown-api")).toThrow("Unsupported provider api: unknown-api");
	});
});
