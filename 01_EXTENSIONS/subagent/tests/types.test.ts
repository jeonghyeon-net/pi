import { describe, it, expect } from "vitest";
import { SubagentParams } from "../src/types.js";
import { Value } from "@sinclair/typebox/value";

describe("types", () => {
	it("SubagentParams validates command string", () => {
		expect(Value.Check(SubagentParams, { command: "run scout -- find auth" })).toBe(true);
	});

	it("SubagentParams rejects missing command", () => {
		expect(Value.Check(SubagentParams, {})).toBe(false);
	});

	it("SubagentParams rejects non-string command", () => {
		expect(Value.Check(SubagentParams, { command: 123 })).toBe(false);
	});
});
