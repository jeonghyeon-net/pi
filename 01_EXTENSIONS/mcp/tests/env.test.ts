import { describe, it, expect } from "vitest";
import { interpolateEnv } from "../src/env.js";

describe("interpolateEnv", () => {
	it("replaces ${VAR} with value", () => {
		expect(interpolateEnv("hello ${NAME}", { NAME: "world" })).toBe(
			"hello world",
		);
	});

	it("leaves missing vars as-is", () => {
		expect(interpolateEnv("hello ${MISSING}", {})).toBe(
			"hello ${MISSING}",
		);
	});

	it("handles multiple vars", () => {
		const result = interpolateEnv("${A} and ${B}", {
			A: "foo",
			B: "bar",
		});
		expect(result).toBe("foo and bar");
	});

	it("no-op on string without vars", () => {
		expect(interpolateEnv("plain text", { X: "y" })).toBe("plain text");
	});

	it("single-pass only (no recursive expansion)", () => {
		// If A resolves to "${B}", B should NOT be expanded
		const result = interpolateEnv("${A}", { A: "${B}", B: "deep" });
		expect(result).toBe("${B}");
	});

	it("handles empty string", () => {
		expect(interpolateEnv("", { X: "y" })).toBe("");
	});

	it("replaces same var used multiple times", () => {
		expect(interpolateEnv("${X}${X}", { X: "a" })).toBe("aa");
	});
});
