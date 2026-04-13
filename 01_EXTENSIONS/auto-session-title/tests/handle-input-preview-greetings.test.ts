import { beforeEach, describe, expect, it } from "vitest";
import { clearOverviewUi, previewOverviewFromInput } from "../src/handlers.js";
import { stubContext } from "./helpers.js";

describe("previewOverviewFromInput greeting guards", () => {
	beforeEach(() => clearOverviewUi(new Set(), stubContext()));
	it("stays disabled even for non-routine greeting-like text", () => {
		expect(previewOverviewFromInput(stubContext(), "Hello branch summary note")).toBe(false);
	});
});
