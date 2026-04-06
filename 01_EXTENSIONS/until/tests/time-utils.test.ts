import { describe, expect, it } from "vitest";
import { formatKoreanDuration, formatClock } from "../src/time-utils.js";

describe("formatKoreanDuration", () => {
	it("returns seconds for ms < 60000", () => {
		expect(formatKoreanDuration(30_000)).toBe("30초");
	});

	it("clamps seconds to minimum 1", () => {
		expect(formatKoreanDuration(0)).toBe("1초");
	});

	it("rounds sub-second values", () => {
		expect(formatKoreanDuration(500)).toBe("1초");
	});

	it("returns minutes for ms < 3600000", () => {
		expect(formatKoreanDuration(120_000)).toBe("2분");
	});

	it("clamps minutes to minimum 1", () => {
		expect(formatKoreanDuration(60_000)).toBe("1분");
	});

	it("returns hours only when minutes are 0", () => {
		expect(formatKoreanDuration(7_200_000)).toBe("2시간");
	});

	it("returns hours and minutes", () => {
		expect(formatKoreanDuration(5_400_000)).toBe("1시간 30분");
	});

	it("handles exactly 1 hour", () => {
		expect(formatKoreanDuration(3_600_000)).toBe("1시간");
	});
});

describe("formatClock", () => {
	it("formats timestamp in ko-KR 24h HH:MM:SS", () => {
		const ts = new Date("2024-01-01T15:30:45+09:00").getTime();
		const result = formatClock(ts);
		expect(result).toMatch(/^\d{2}:\d{2}:\d{2}$/);
	});

	it("returns consistent format for midnight", () => {
		const ts = new Date("2024-01-01T00:00:00+09:00").getTime();
		const result = formatClock(ts);
		expect(result).toMatch(/^\d{2}:\d{2}:\d{2}$/);
	});
});
