import { describe, it, expect, vi } from "vitest";
import { codeSearch } from "../src/code-search.js";

describe("codeSearch", () => {
	it("calls Exa MCP with correct tool and params", async () => {
		const mockFetch = vi.fn().mockResolvedValue({
			ok: true,
			text: async () => JSON.stringify({
				result: { content: [{ type: "text", text: "function main() {}" }] },
			}),
		});
		const result = await codeSearch("react hooks", 3000, mockFetch);
		expect(result).toBe("function main() {}");
		const body = JSON.parse(mockFetch.mock.calls[0][1].body);
		expect(body.params.name).toBe("get_code_context_exa");
		expect(body.params.arguments.tokensNum).toBe(3000);
	});
	it("passes signal through", async () => {
		const mockFetch = vi.fn().mockResolvedValue({
			ok: true,
			text: async () => '{"result":{"content":[{"type":"text","text":"ok"}]}}',
		});
		const controller = new AbortController();
		await codeSearch("q", 5000, mockFetch, controller.signal);
		expect(mockFetch.mock.calls[0][1].signal).toBe(controller.signal);
	});
});
