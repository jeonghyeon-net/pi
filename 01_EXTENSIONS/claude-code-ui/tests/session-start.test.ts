import type { ExtensionContext } from "@mariozechner/pi-coding-agent";
import { beforeEach, describe, expect, it, vi } from "vitest";

const applyAssistantMessagePatch = vi.fn();
const applyClaudeChrome = vi.fn();
const applyLoaderPatch = vi.fn();
const applyToolExecutionPatch = vi.fn();
vi.mock("../src/assistant-message-patch.ts", () => ({ applyAssistantMessagePatch }));
vi.mock("../src/chrome.ts", () => ({ applyClaudeChrome }));
vi.mock("../src/loader-patch.ts", () => ({ applyLoaderPatch }));
vi.mock("../src/tool-execution-patch.ts", () => ({ applyToolExecutionPatch }));

const { onSessionStart } = await import("../src/session-start.ts");

describe("onSessionStart", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("only applies chrome when UI is available", async () => {
		await onSessionStart({}, { hasUI: false } as ExtensionContext);
		await onSessionStart({}, { hasUI: true } as ExtensionContext);
		expect(applyAssistantMessagePatch).toHaveBeenCalledTimes(1);
		expect(applyLoaderPatch).toHaveBeenCalledTimes(1);
		expect(applyToolExecutionPatch).toHaveBeenCalledTimes(1);
		expect(applyClaudeChrome).toHaveBeenCalledTimes(1);
	});

	it("keeps the extension alive when runtime patches fail", async () => {
		applyAssistantMessagePatch.mockRejectedValueOnce(new Error("boom"));
		applyLoaderPatch.mockRejectedValueOnce(new Error("boom"));
		applyToolExecutionPatch.mockRejectedValueOnce(new Error("boom"));
		await onSessionStart({}, { hasUI: true } as ExtensionContext);
		expect(applyClaudeChrome).toHaveBeenCalledTimes(1);
	});
});
