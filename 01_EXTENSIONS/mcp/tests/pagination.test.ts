import { describe, expect, it, vi } from "vitest";
import { paginateAll } from "../src/pagination.js";

describe("paginateAll", () => {
	it("collects single page without cursor", async () => {
		const fetcher = vi.fn().mockResolvedValue({ items: [1, 2], nextCursor: undefined });
		const result = await paginateAll(fetcher);
		expect(result).toEqual([1, 2]);
		expect(fetcher).toHaveBeenCalledWith(undefined);
	});

	it("follows cursors across multiple pages", async () => {
		const fetcher = vi.fn()
			.mockResolvedValueOnce({ items: ["a"], nextCursor: "cur1" })
			.mockResolvedValueOnce({ items: ["b"], nextCursor: "cur2" })
			.mockResolvedValueOnce({ items: ["c"], nextCursor: undefined });
		const result = await paginateAll(fetcher);
		expect(result).toEqual(["a", "b", "c"]);
		expect(fetcher).toHaveBeenCalledTimes(3);
		expect(fetcher).toHaveBeenNthCalledWith(2, "cur1");
		expect(fetcher).toHaveBeenNthCalledWith(3, "cur2");
	});

	it("returns empty array for empty page", async () => {
		const fetcher = vi.fn().mockResolvedValue({ items: [], nextCursor: undefined });
		expect(await paginateAll(fetcher)).toEqual([]);
	});

	it("stops at max pages to prevent infinite loops", async () => {
		const fetcher = vi.fn().mockResolvedValue({ items: [1], nextCursor: "loop" });
		const result = await paginateAll(fetcher, 3);
		expect(result).toEqual([1, 1, 1]);
		expect(fetcher).toHaveBeenCalledTimes(3);
	});

	it("propagates fetcher errors", async () => {
		const fetcher = vi.fn().mockRejectedValue(new Error("fetch failed"));
		await expect(paginateAll(fetcher)).rejects.toThrow("fetch failed");
	});
});
