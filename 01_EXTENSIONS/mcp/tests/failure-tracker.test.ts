import { describe, it, expect, beforeEach } from "vitest";
import {
	recordFailure,
	getFailure,
	clearFailure,
	clearAllFailures,
} from "../src/failure-tracker.js";

describe("failure-tracker", () => {
	beforeEach(() => {
		clearAllFailures();
	});

	it("records a failure", () => {
		recordFailure("server-a");
		const record = getFailure("server-a");
		expect(record).toBeDefined();
		expect(record!.count).toBe(1);
		expect(record!.at).toBeGreaterThan(0);
	});

	it("increments count on repeated failure", () => {
		recordFailure("server-a");
		recordFailure("server-a");
		recordFailure("server-a");
		expect(getFailure("server-a")!.count).toBe(3);
	});

	it("returns undefined for unknown server", () => {
		expect(getFailure("unknown")).toBeUndefined();
	});

	it("clears specific server", () => {
		recordFailure("server-a");
		recordFailure("server-b");
		clearFailure("server-a");
		expect(getFailure("server-a")).toBeUndefined();
		expect(getFailure("server-b")).toBeDefined();
	});

	it("clears all failures", () => {
		recordFailure("server-a");
		recordFailure("server-b");
		clearAllFailures();
		expect(getFailure("server-a")).toBeUndefined();
		expect(getFailure("server-b")).toBeUndefined();
	});
});
