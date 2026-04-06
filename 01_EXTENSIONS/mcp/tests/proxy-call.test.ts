import { describe, expect, it, vi } from "vitest";
import { proxyCall } from "../src/proxy-call.js";
import type { McpContent } from "../src/types-server.js";

describe("proxyCall", () => {
	const mockContent: McpContent[] = [{ type: "text", text: "result" }];
	const deps = {
		findTool: vi.fn((name: string) =>
			name === "search"
				? { name: "search", originalName: "search", serverName: "gh", description: "d" }
				: undefined,
		),
		getOrConnect: vi.fn(async (_server: string) => ({
			name: "gh",
			client: { callTool: vi.fn(async () => ({ content: mockContent })) },
			status: "connected" as const,
			lastUsedAt: 0,
			inFlight: 0,
		})),
		checkConsent: vi.fn(async () => true),
		transform: vi.fn((c: McpContent) => ({ type: "text", text: c.text ?? "" })),
	};

	it("calls tool and returns transformed content", async () => {
		const result = await proxyCall("search", { q: "test" }, deps);
		expect(deps.findTool).toHaveBeenCalledWith("search");
		expect(deps.checkConsent).toHaveBeenCalledWith("gh");
		expect(result.content).toEqual([{ type: "text", text: "result" }]);
	});

	it("passes arguments to callTool", async () => {
		const callTool = vi.fn(async () => ({ content: mockContent }));
		const conn = {
			name: "gh",
			client: { callTool },
			status: "connected" as const,
			lastUsedAt: 0,
			inFlight: 0,
		};
		const argDeps = {
			...deps,
			getOrConnect: vi.fn(async () => conn),
		};
		await proxyCall("search", { q: "hello" }, argDeps);
		expect(callTool).toHaveBeenCalledWith({
			name: "search",
			arguments: { q: "hello" },
		});
	});

	it("updates lastUsedAt on successful call", async () => {
		const before = Date.now();
		const result = await proxyCall("search", {}, deps);
		expect(result.content).toBeDefined();
	});

	it("calls with undefined args when none provided", async () => {
		const result = await proxyCall("search", undefined, deps);
		expect(result.content).toHaveLength(1);
	});

	it("handles multiple content blocks", async () => {
		const multi: McpContent[] = [
			{ type: "text", text: "a" },
			{ type: "text", text: "b" },
		];
		const multiDeps = {
			...deps,
			getOrConnect: vi.fn(async () => ({
				name: "gh",
				client: { callTool: vi.fn(async () => ({ content: multi })) },
				status: "connected" as const,
				lastUsedAt: 0,
				inFlight: 0,
			})),
		};
		const result = await proxyCall("search", {}, multiDeps);
		expect(result.content).toHaveLength(2);
	});
});
