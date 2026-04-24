import { describe, expect, it } from "vitest";
import { resolveFromModule } from "../src/internal-module.ts";

describe("resolveFromModule", () => {
	it("joins files under the resolved module directory", () => {
		const file = resolveFromModule("file:///tmp/pkg/dist/index.js", "modes/interactive/components/assistant-message.js");
		expect(file).toBe("file:///tmp/pkg/dist/modes/interactive/components/assistant-message.js");
	});

	it("supports parent traversal for bundled nested dependencies", () => {
		const file = resolveFromModule("file:///tmp/pkg/dist/index.js", "../node_modules/@mariozechner/pi-tui/dist/components/loader.js");
		expect(file).toBe("file:///tmp/pkg/node_modules/@mariozechner/pi-tui/dist/components/loader.js");
	});
});
