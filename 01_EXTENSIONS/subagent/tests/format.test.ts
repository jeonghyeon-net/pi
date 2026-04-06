import { describe, it, expect } from "vitest";
import { formatTokens, formatUsage, formatDuration } from "../src/format.js";

describe("formatTokens", () => {
	it("formats small numbers", () => expect(formatTokens(500)).toBe("500"));
	it("formats thousands", () => expect(formatTokens(12500)).toBe("12.5k"));
	it("formats millions", () => expect(formatTokens(1200000)).toBe("1.2M"));
	it("handles zero", () => expect(formatTokens(0)).toBe("0"));
});

describe("formatUsage", () => {
	it("formats usage stats", () => {
		const s = formatUsage({ inputTokens: 1000, outputTokens: 500, turns: 3 });
		expect(s).toContain("1.0k");
		expect(s).toContain("500");
		expect(s).toContain("3");
	});
});

describe("formatDuration", () => {
	it("formats seconds", () => expect(formatDuration(5000)).toBe("5s"));
	it("formats minutes", () => expect(formatDuration(125000)).toBe("2m 5s"));
	it("handles zero", () => expect(formatDuration(0)).toBe("0s"));
});
