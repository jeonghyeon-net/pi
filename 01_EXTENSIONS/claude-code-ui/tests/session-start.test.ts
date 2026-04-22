import type { ExtensionContext } from "@mariozechner/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";

const applyAssistantMessagePatch = vi.fn();
const applyClaudeChrome = vi.fn();
const applyLoaderPatch = vi.fn();
vi.mock("../src/assistant-message-patch.ts", () => ({ applyAssistantMessagePatch }));
vi.mock("../src/chrome.ts", () => ({ applyClaudeChrome }));
vi.mock("../src/loader-patch.ts", () => ({ applyLoaderPatch }));

const { onSessionStart } = await import("../src/session-start.ts");

describe("onSessionStart", () => {
	it("only applies chrome when UI is available", async () => {
		await onSessionStart({}, { hasUI: false } as ExtensionContext);
		await onSessionStart({}, { hasUI: true } as ExtensionContext);
		expect(applyAssistantMessagePatch).toHaveBeenCalledTimes(1);
		expect(applyLoaderPatch).toHaveBeenCalledTimes(1);
		expect(applyClaudeChrome).toHaveBeenCalledTimes(1);
	});
});
