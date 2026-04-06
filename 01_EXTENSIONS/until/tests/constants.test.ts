import { describe, expect, it } from "vitest";
import {
	CUSTOM_TYPE,
	STATUS_KEY,
	MAX_TASKS,
	MIN_INTERVAL_MS,
	MAX_EXPIRY_MS,
	JITTER_RATIO,
} from "../src/constants.js";

describe("constants", () => {
	it("CUSTOM_TYPE is 'until'", () => {
		expect(CUSTOM_TYPE).toBe("until");
	});

	it("STATUS_KEY is 'until-footer'", () => {
		expect(STATUS_KEY).toBe("until-footer");
	});

	it("MAX_TASKS is 3", () => {
		expect(MAX_TASKS).toBe(3);
	});

	it("MIN_INTERVAL_MS is 60000", () => {
		expect(MIN_INTERVAL_MS).toBe(60_000);
	});

	it("MAX_EXPIRY_MS is 24 hours in ms", () => {
		expect(MAX_EXPIRY_MS).toBe(86_400_000);
	});

	it("JITTER_RATIO is 0.1", () => {
		expect(JITTER_RATIO).toBe(0.1);
	});
});
