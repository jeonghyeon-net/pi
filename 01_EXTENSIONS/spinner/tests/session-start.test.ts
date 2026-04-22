import type { ExtensionContext } from "@mariozechner/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";
import { onSessionStart } from "../src/session-start.ts";

describe("spinner session start", () => {
	it("applies Claude Code frames only when UI is available", () => {
		const setWorkingIndicator = vi.fn();
		onSessionStart({}, { hasUI: false } as ExtensionContext);
		onSessionStart({}, { hasUI: true, ui: { setWorkingIndicator, theme: { fg: (_token: string, text: string) => text } } } as ExtensionContext);
		expect(setWorkingIndicator).toHaveBeenCalledWith({
			frames: ["·", "✢", "✳", "✶", "✻", "✽", "✽", "✻", "✶", "✳", "✢", "·"],
			intervalMs: 120,
		});
	});
});
