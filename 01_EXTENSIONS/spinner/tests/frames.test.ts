import { describe, expect, it } from "vitest";
import { getSpinnerFrames, SPINNER_INTERVAL_MS } from "../src/frames.ts";

describe("spinner frames", () => {
	it("matches Claude Code ghostty fallback", () => {
		expect(getSpinnerFrames("xterm-ghostty", "darwin")).toEqual(["·", "✢", "✳", "✶", "✻", "*", "*", "✻", "✶", "✳", "✢", "·"]);
	});

	it("matches Claude Code platform defaults", () => {
		expect(getSpinnerFrames("xterm-256color", "darwin")).toEqual(["·", "✢", "✳", "✶", "✻", "✽", "✽", "✻", "✶", "✳", "✢", "·"]);
		expect(getSpinnerFrames("xterm-256color", "linux")).toEqual(["·", "✢", "*", "✶", "✻", "✽", "✽", "✻", "✶", "*", "✢", "·"]);
		expect(SPINNER_INTERVAL_MS).toBe(120);
	});
});
