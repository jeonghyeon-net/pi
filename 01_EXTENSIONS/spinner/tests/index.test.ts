import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import extension from "../src/index.ts";
import { describe, expect, it, vi } from "vitest";

describe("spinner index", () => {
	it("exports an extension function", () => {
		expect(typeof extension).toBe("function");
	});

	it("registers a session-start handler", () => {
		const on = vi.fn();
		extension({ on } as ExtensionAPI);
		expect(on).toHaveBeenCalledWith("session_start", expect.any(Function));
	});
});
