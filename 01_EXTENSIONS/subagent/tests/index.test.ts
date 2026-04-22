import extension from "../src/index.ts";
import { describe, expect, it } from "vitest";

describe("subagent index", () => {
	it("exports an extension function", () => {
		expect(typeof extension).toBe("function");
	});
});
