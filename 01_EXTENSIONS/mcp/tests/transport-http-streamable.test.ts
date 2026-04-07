import { describe, expect, it, vi } from "vitest";
import { createStreamableHttpTransport } from "../src/transport-http-streamable.js";

describe("createStreamableHttpTransport", () => {
	it("creates transport with url and headers", async () => {
		const mockTransport = { close: vi.fn() };
		const factory = vi.fn().mockResolvedValue(mockTransport);
		const result = await createStreamableHttpTransport(
			"http://localhost:3000/mcp", { "X-Key": "val" }, factory,
		);
		expect(factory).toHaveBeenCalledWith(
			"http://localhost:3000/mcp", { "X-Key": "val" },
		);
		expect(result).toBe(mockTransport);
	});

	it("creates transport without headers", async () => {
		const mockTransport = { close: vi.fn() };
		const factory = vi.fn().mockResolvedValue(mockTransport);
		await createStreamableHttpTransport("http://host/mcp", undefined, factory);
		expect(factory).toHaveBeenCalledWith("http://host/mcp", undefined);
	});

	it("propagates factory errors", async () => {
		const factory = vi.fn().mockRejectedValue(new Error("connect failed"));
		await expect(
			createStreamableHttpTransport("http://bad", undefined, factory),
		).rejects.toThrow("connect failed");
	});
});
