import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearOverviewUi, previewOverviewFromInput } from "../src/handlers.js";
import { stubContext } from "./helpers.js";

describe("previewOverviewFromInput footer status", () => {
	beforeEach(() => clearOverviewUi(new Set(), stubContext()));

	it("does not write footer status during empty preview phase", () => {
		const base = stubContext();
		const setStatus = vi.fn();
		const ctx = { ...base, ui: { ...base.ui, setStatus } };
		expect(previewOverviewFromInput(ctx, "README.md에 설명 추가해줘")).toBe(false);
		expect(setStatus).not.toHaveBeenCalled();
		clearOverviewUi(new Set(), ctx);
		expect(setStatus).not.toHaveBeenCalled();
	});
});
