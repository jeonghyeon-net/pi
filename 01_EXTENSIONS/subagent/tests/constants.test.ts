import { describe, it, expect } from "vitest";
import * as C from "../src/constants.js";

describe("constants", () => {
	it("batch/concurrency limits are positive", () => {
		expect(C.MAX_BATCH_TASKS).toBeGreaterThan(0);
		expect(C.MAX_CONCURRENCY).toBeGreaterThan(0);
	});

	it("retry config is valid", () => {
		expect(C.MAX_RETRIES).toBeGreaterThan(0);
		expect(C.RETRY_BASE_MS).toBeGreaterThan(0);
	});

	it("escalation marker is non-empty", () => {
		expect(C.ESCALATION_MARKER.length).toBeGreaterThan(0);
	});

	it("pipeline max chars is positive", () => {
		expect(C.PIPELINE_MAX_CHARS).toBeGreaterThan(0);
	});

	it("queue interval is positive", () => {
		expect(C.QUEUE_INTERVAL_MS).toBeGreaterThan(0);
	});
});
