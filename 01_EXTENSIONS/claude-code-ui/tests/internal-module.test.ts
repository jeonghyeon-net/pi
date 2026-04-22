import { describe, expect, it } from "vitest";
import { resolvePackageFile } from "../src/internal-module.ts";

describe("resolvePackageFile", () => {
	it("finds installed package files", () => {
		const file = resolvePackageFile("@mariozechner/pi-coding-agent", "package.json");
		expect(file).toContain("@mariozechner/pi-coding-agent/package.json");
	});

	it("throws when the package file cannot be found", () => {
		expect(() => resolvePackageFile("@mariozechner/does-not-exist", "missing.js")).toThrow();
		expect(() => resolvePackageFile("node:fs", "missing.js")).toThrow();
	});
});
