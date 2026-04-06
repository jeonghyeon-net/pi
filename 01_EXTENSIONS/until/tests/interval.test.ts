import { describe, expect, it } from "vitest";
import { parseInterval } from "../src/interval.js";

describe("parseInterval", () => {
	it("returns null for empty string", () => {
		expect(parseInterval("")).toBeNull();
	});

	it("returns null for whitespace-only", () => {
		expect(parseInterval("   ")).toBeNull();
	});

	it("returns null for non-matching input", () => {
		expect(parseInterval("hello")).toBeNull();
	});

	it("parses '5m' as 5 minutes", () => {
		expect(parseInterval("5m")).toEqual({ ms: 300_000, label: "5분" });
	});

	it("parses '10M' case-insensitively", () => {
		expect(parseInterval("10M")).toEqual({ ms: 600_000, label: "10분" });
	});

	it("parses '2h' as 2 hours", () => {
		expect(parseInterval("2h")).toEqual({ ms: 7_200_000, label: "2시간" });
	});

	it("parses '1H' case-insensitively", () => {
		expect(parseInterval("1H")).toEqual({ ms: 3_600_000, label: "1시간" });
	});

	it("parses '5분' Korean unit", () => {
		expect(parseInterval("5분")).toEqual({ ms: 300_000, label: "5분" });
	});

	it("parses '2시간' Korean unit", () => {
		expect(parseInterval("2시간")).toEqual({ ms: 7_200_000, label: "2시간" });
	});

	it("parses '5분마다' with 마다 suffix", () => {
		expect(parseInterval("5분마다")).toEqual({ ms: 300_000, label: "5분" });
	});

	it("parses '1시간마다' with 마다 suffix", () => {
		expect(parseInterval("1시간마다")).toEqual({ ms: 3_600_000, label: "1시간" });
	});

	it("parses decimal amounts like '1.5h'", () => {
		expect(parseInterval("1.5h")).toEqual({ ms: 5_400_000, label: "1.5시간" });
	});

	it("handles leading/trailing whitespace", () => {
		expect(parseInterval("  3m  ")).toEqual({ ms: 180_000, label: "3분" });
	});

	it("returns null for zero amount", () => {
		expect(parseInterval("0m")).toBeNull();
	});

	it("returns null for negative-like input", () => {
		expect(parseInterval("-1m")).toBeNull();
	});

	it("returns null for unknown unit", () => {
		expect(parseInterval("5s")).toBeNull();
	});
});
