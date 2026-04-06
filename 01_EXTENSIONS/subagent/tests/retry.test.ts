import { describe, it, expect, vi } from "vitest";
import { isTransient, withRetry } from "../src/retry.js";

describe("isTransient", () => {
	it("detects network errors", () => {
		expect(isTransient(new Error("ECONNRESET"))).toBe(true);
		expect(isTransient(new Error("ETIMEDOUT"))).toBe(true);
	});

	it("detects rate limit", () => {
		expect(isTransient(new Error("429 Too Many Requests"))).toBe(true);
	});

	it("detects 5xx", () => {
		expect(isTransient(new Error("502 Bad Gateway"))).toBe(true);
	});

	it("rejects permanent errors", () => {
		expect(isTransient(new Error("404 Not Found"))).toBe(false);
		expect(isTransient(new Error("Invalid API key"))).toBe(false);
	});
});

describe("withRetry", () => {
	it("returns on first success", async () => {
		const fn = vi.fn().mockResolvedValue("ok");
		expect(await withRetry(fn, 3, 1)).toBe("ok");
		expect(fn).toHaveBeenCalledTimes(1);
	});

	it("retries on transient failure", async () => {
		const fn = vi.fn()
			.mockRejectedValueOnce(new Error("ECONNRESET"))
			.mockResolvedValue("ok");
		expect(await withRetry(fn, 3, 1)).toBe("ok");
		expect(fn).toHaveBeenCalledTimes(2);
	});

	it("throws after max retries", async () => {
		const fn = vi.fn().mockRejectedValue(new Error("ECONNRESET"));
		await expect(withRetry(fn, 2, 1)).rejects.toThrow("ECONNRESET");
		expect(fn).toHaveBeenCalledTimes(3);
	});

	it("throws immediately on permanent error", async () => {
		const fn = vi.fn().mockRejectedValue(new Error("Invalid key"));
		await expect(withRetry(fn, 3, 1)).rejects.toThrow("Invalid key");
		expect(fn).toHaveBeenCalledTimes(1);
	});

	it("wraps non-Error throws", async () => {
		const fn = vi.fn().mockRejectedValue("string error");
		await expect(withRetry(fn, 0, 1)).rejects.toThrow("string error");
	});
});
