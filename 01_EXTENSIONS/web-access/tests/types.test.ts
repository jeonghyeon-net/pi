import { describe, it, expect } from "vitest";
import { WebSearchParams, CodeSearchParams, FetchContentParams } from "../src/types.js";

describe("WebSearchParams", () => {
	it("has query property", () => {
		expect(WebSearchParams.properties.query).toBeDefined();
	});
	it("has optional numResults", () => {
		expect(WebSearchParams.properties.numResults).toBeDefined();
	});
});

describe("CodeSearchParams", () => {
	it("has query property", () => {
		expect(CodeSearchParams.properties.query).toBeDefined();
	});
	it("has optional maxTokens", () => {
		expect(CodeSearchParams.properties.maxTokens).toBeDefined();
	});
});

describe("FetchContentParams", () => {
	it("has url property", () => {
		expect(FetchContentParams.properties.url).toBeDefined();
	});
});
