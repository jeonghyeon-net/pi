import { describe, expect, it } from "vitest";
import { parseChangedPaths, toComparison } from "../src/git-parse.ts";

describe("parseChangedPaths", () => {
	it("parses modified, added, deleted, and renamed files", () => {
		const changes = parseChangedPaths("M\tsrc/a.ts\nA\tsrc/b.ts\nD\tsrc/c.ts\nR100\told.ts\tnew.ts\n");
		expect(changes.map((file) => file.displayPath)).toEqual(["old.ts -> new.ts", "src/a.ts", "src/b.ts", "src/c.ts"]);
		expect(toComparison(changes[0]).hasOriginal || toComparison(changes[0]).hasModified).toBe(true);
	});

	it("filters minified assets", () => {
		expect(parseChangedPaths("M\tapp.min.js\nM\tstyles.min.css\nM\tsrc/a.ts\n")).toHaveLength(1);
	});
});
