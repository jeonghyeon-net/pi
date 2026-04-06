import { describe, it, expect } from "vitest";
import { formatSchema } from "../src/schema-format.js";

describe("formatSchema", () => {
	it("formats simple object schema with name, type, required", () => {
		const schema = {
			type: "object",
			properties: { query: { type: "string", description: "Search query" } },
			required: ["query"],
		};
		const result = formatSchema(schema);
		expect(result).toContain("query: string");
		expect(result).toContain("[required]");
		expect(result).toContain("- Search query");
	});

	it("returns no parameters when properties is empty", () => {
		expect(formatSchema({ type: "object", properties: {} })).toBe("(no parameters)");
	});

	it("returns no parameters for null", () => {
		expect(formatSchema(null)).toBe("(no parameters)");
	});

	it("returns no parameters for undefined", () => {
		expect(formatSchema(undefined)).toBe("(no parameters)");
	});

	it("shows optional for non-required fields", () => {
		const schema = {
			type: "object",
			properties: { limit: { type: "number" } },
		};
		expect(formatSchema(schema)).toContain("[optional]");
	});

	it("shows enum values", () => {
		const schema = {
			type: "object",
			properties: { mode: { type: "string", enum: ["fast", "slow"] } },
		};
		const result = formatSchema(schema);
		expect(result).toContain("(fast | slow)");
	});

	it("shows unknown when type is missing", () => {
		const schema = {
			type: "object",
			properties: { data: {} },
		};
		expect(formatSchema(schema)).toContain("data: unknown");
	});
});
