import { describe, expect, it } from "vitest";
import { DEFAULT_MAX_TITLE_LENGTH, normalizeTitle, truncateTitle } from "../src/title.js";

describe("normalizeTitle", () => {
	it("returns undefined for empty input", () => {
		expect(normalizeTitle("   ")).toBeUndefined();
	});

	it("strips markdown noise, list prefixes, and wrapping punctuation", () => {
		expect(normalizeTitle("#   `Fix footer title`  ")).toBe("Fix footer title");
	});

	it("returns undefined when markdown noise or punctuation removes the whole title", () => {
		expect(normalizeTitle("```ts\nconst x = 1\n``` ")).toBeUndefined();
		expect(normalizeTitle("''")).toBeUndefined();
	});

	it("truncates long titles at a word boundary", () => {
		const input = "Implement automatic session titles from the first user message";
		const title = normalizeTitle(input);
		expect(title).toBe("Implement automatic session titles from the…");
		expect(title!.length).toBeLessThanOrEqual(DEFAULT_MAX_TITLE_LENGTH);
	});
});

describe("truncateTitle", () => {
	it("returns short text unchanged", () => {
		expect(truncateTitle("short")).toBe("short");
	});

	it("falls back to a hard cutoff when no word break exists", () => {
		expect(truncateTitle("abcdefghijklmnopqrstuvwxyz", 10)).toBe("abcdefghij…");
	});
});
