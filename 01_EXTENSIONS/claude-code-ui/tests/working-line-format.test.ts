import { describe, expect, it } from "vitest";
import { formatElapsed, formatWorkingLine, pickWorkingPhrase } from "../src/working-line-format.ts";

describe("working-line format", () => {
	it("picks phrases and formats elapsed time", () => {
		expect(pickWorkingPhrase(() => 0)).toBe("Thinking...");
		expect(pickWorkingPhrase(() => 0.99)).toBe("Working...");
		expect(pickWorkingPhrase(() => Number.NaN)).toBe("Working...");
		expect(formatElapsed(900)).toBe("0s");
		expect(formatElapsed(61_000)).toBe("1m 01s");
	});

	it("joins only defined parts", () => {
		expect(formatWorkingLine(["Thinking...", undefined, "2s"])).toBe("Thinking... · 2s");
	});
});
