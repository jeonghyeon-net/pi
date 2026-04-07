import { describe, it, expect } from "vitest";
import { parallelLimit } from "../src/parallel.js";

describe("parallelLimit", () => {
	it("executes all items and preserves order", async () => {
		const items = [1, 2, 3, 4, 5];
		const results = await parallelLimit(
			items,
			async (n) => n * 10,
			3,
		);
		expect(results).toEqual([10, 20, 30, 40, 50]);
	});

	it("respects concurrency limit", async () => {
		let concurrent = 0;
		let maxConcurrent = 0;
		const items = [1, 2, 3, 4, 5, 6];

		await parallelLimit(
			items,
			async (n) => {
				concurrent++;
				if (concurrent > maxConcurrent) maxConcurrent = concurrent;
				await new Promise((r) => setTimeout(r, 10));
				concurrent--;
				return n;
			},
			2,
		);

		expect(maxConcurrent).toBe(2);
	});

	it("handles empty array", async () => {
		const results = await parallelLimit(
			[],
			async (n: number) => n,
			3,
		);
		expect(results).toEqual([]);
	});

	it("propagates errors", async () => {
		const items = [1, 2, 3];
		await expect(
			parallelLimit(
				items,
				async (n) => {
					if (n === 2) throw new Error("fail");
					return n;
				},
				2,
			),
		).rejects.toThrow("fail");
	});

	it("works when limit exceeds item count", async () => {
		const results = await parallelLimit(
			[1, 2],
			async (n) => n * 2,
			10,
		);
		expect(results).toEqual([2, 4]);
	});
});
