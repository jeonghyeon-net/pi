import { describe, it, expect, beforeEach } from "vitest";
import {
	recordFailure,
	getFailure,
	clearFailure,
	clearAllFailures,
	getBackoffMs,
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

	it("getBackoffMs returns 0 for unknown server", () => {
		expect(getBackoffMs("unknown")).toBe(0);
	});

	it("getBackoffMs returns exponential backoff", () => {
		recordFailure("server-a");
		expect(getBackoffMs("server-a")).toBe(2000);
		recordFailure("server-a");
		expect(getBackoffMs("server-a")).toBe(4000);
		recordFailure("server-a");
		expect(getBackoffMs("server-a")).toBe(8000);
	});

	it("getBackoffMs caps at max", () => {
		for (let i = 0; i < 20; i++) recordFailure("server-a");
		expect(getBackoffMs("server-a")).toBe(300000);
	});
});
