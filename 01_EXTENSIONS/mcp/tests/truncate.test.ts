import { describe, it, expect } from "vitest";
import { truncateAtWord } from "../src/truncate.js";

describe("truncateAtWord", () => {
	it("returns unchanged if within limit", () => {
		expect(truncateAtWord("hello", 10)).toBe("hello");
	});

	it("returns unchanged if exactly at limit", () => {
		expect(truncateAtWord("hello", 5)).toBe("hello");
	});

	it("truncates at word boundary", () => {
		const text = "hello world this is long";
		// target=11 => lastIndexOf(" ", 11) = 11 (the space before "this")
		// 11 > 11*0.6=6.6 => true => slice(0,11) + "..."
		expect(truncateAtWord(text, 11)).toBe("hello world...");
	});

	it("truncates mid-word if no good word break", () => {
		// "abcdefghij..." with target=5 => lastIndexOf(" ", 5) = -1
		// -1 > 5*0.6=3 => false => slice(0,5) + "..."
		expect(truncateAtWord("abcdefghijklmnop", 5)).toBe("abcde...");
	});

	it("handles empty string", () => {
		expect(truncateAtWord("", 10)).toBe("");
	});

	it("uses word boundary if past 60% of target", () => {
		// "aa bb cc dd ee" target=8
		// lastIndexOf(" ", 8) = 7 (space before "dd")
		// 7 > 8*0.6=4.8 => true => slice(0,7) + "..."
		expect(truncateAtWord("aa bb cc dd ee", 8)).toBe("aa bb cc...");
	});

	it("does not use word boundary if before 60% of target", () => {
		// "ab cdefghijklmnop" target=10
		// lastIndexOf(" ", 10) = 2
		// 2 > 10*0.6=6 => false => slice(0,10) + "..."
		expect(truncateAtWord("ab cdefghijklmnop", 10)).toBe("ab cdefghi...");
	});
});
