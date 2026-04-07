import { describe, expect, it } from "vitest";
import { parseDirectToolsEnv } from "../src/tool-direct.js";

describe("parseDirectToolsEnv", () => {
	it("returns undefined when env var not set", () => {
		expect(parseDirectToolsEnv(undefined)).toBeUndefined();
	});
	it("returns false for __none__", () => {
		expect(parseDirectToolsEnv("__none__")).toBe(false);
	});
	it("parses server-level directive", () => {
		const result = parseDirectToolsEnv("myserver");
		expect(result).toEqual(
			new Map([["myserver", true]]),
		);
	});
	it("parses server/tool directive", () => {
		const result = parseDirectToolsEnv("myserver/search");
		expect(result).toEqual(
			new Map([["myserver", ["search"]]]),
		);
	});
	it("parses multiple comma-separated directives", () => {
		const result = parseDirectToolsEnv("s1,s2/tool1,s2/tool2");
		expect(result).toEqual(
			new Map([["s1", true], ["s2", ["tool1", "tool2"]]]),
		);
	});
	it("trims whitespace", () => {
		const result = parseDirectToolsEnv(" s1 , s2/tool ");
		expect(result).toEqual(
			new Map([["s1", true], ["s2", ["tool"]]]),
		);
	});
	it("returns undefined for empty string", () => {
		expect(parseDirectToolsEnv("")).toBeUndefined();
	});
	it("skips empty parts from consecutive commas", () => {
		const result = parseDirectToolsEnv("s1,,s2");
		expect(result).toEqual(
			new Map([["s1", true], ["s2", true]]),
		);
	});
});
