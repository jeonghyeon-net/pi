import { describe, expect, it, vi } from "vitest";
import { createSseTransport } from "../src/transport-http-sse.js";

describe("createSseTransport", () => {
	it("creates transport with url and headers", async () => {
		const mockTransport = { close: vi.fn() };
		const factory = vi.fn().mockResolvedValue(mockTransport);
		const result = await createSseTransport(
			"http://localhost:3000/sse", { Authorization: "Bearer tok" }, factory,
		);
		expect(factory).toHaveBeenCalledWith(
			"http://localhost:3000/sse", { Authorization: "Bearer tok" },
		);
		expect(result).toBe(mockTransport);
	});

	it("creates transport without headers", async () => {
		const mockTransport = { close: vi.fn() };
		const factory = vi.fn().mockResolvedValue(mockTransport);
		await createSseTransport("http://host/sse", undefined, factory);
		expect(factory).toHaveBeenCalledWith("http://host/sse", undefined);
	});

	it("propagates factory errors", async () => {
		const factory = vi.fn().mockRejectedValue(new Error("sse failed"));
		await expect(
			createSseTransport("http://bad", undefined, factory),
		).rejects.toThrow("sse failed");
	});
});
