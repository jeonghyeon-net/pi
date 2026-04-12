import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_ENABLED } from "../src/constants.js";
import { isEnabled, resetState, setEnabled } from "../src/state.js";

describe("state", () => {
	beforeEach(() => {
		resetState();
	});

	it("starts enabled by default and reports changes", () => {
		expect(isEnabled()).toBe(DEFAULT_ENABLED);
		expect(setEnabled(false)).toBe(true);
		expect(isEnabled()).toBe(false);
		expect(setEnabled(false)).toBe(false);
	});

	it("reset restores default enabled state", () => {
		setEnabled(false);
		resetState();
		expect(isEnabled()).toBe(DEFAULT_ENABLED);
	});
});
