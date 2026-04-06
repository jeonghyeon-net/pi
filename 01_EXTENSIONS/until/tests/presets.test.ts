import { describe, it, expect, vi, beforeEach } from "vitest";
import { readdir } from "node:fs/promises";
import { readdirSync, readFileSync } from "node:fs";
import { parseFrontmatter } from "../src/frontmatter.js";
import { parseInterval } from "../src/interval.js";

vi.mock("node:fs/promises", () => ({ readdir: vi.fn() }));
vi.mock("node:fs", () => ({ readdirSync: vi.fn(), readFileSync: vi.fn() }));
vi.mock("../src/frontmatter.js", () => ({ parseFrontmatter: vi.fn() }));
vi.mock("../src/interval.js", () => ({ parseInterval: vi.fn() }));

const rd = vi.mocked(readdir);
const rdS = vi.mocked(readdirSync);
const rfS = vi.mocked(readFileSync);
const fm = vi.mocked(parseFrontmatter);
const pi = vi.mocked(parseInterval);
const { loadPresets, getPresetCompletions } = await import("../src/presets.js");
const IV = { ms: 300_000, label: "5분" };

function mockDir(files: string[]) { rd.mockImplementation(() => Promise.resolve(files)); }
function mockDirSync(files: string[]) { rdS.mockImplementation(() => files); }
function setup(body: string, meta: Record<string, string> = { interval: "5m", description: "D" }) {
	rfS.mockReturnValue("raw");
	fm.mockReturnValue({ meta, body });
	pi.mockReturnValue(body && meta.interval !== "x" ? IV : null);
}

beforeEach(() => vi.resetAllMocks());

describe("loadPresets", () => {
	it("returns empty when readdir throws", async () => {
		rd.mockRejectedValue(new Error("ENOENT"));
		expect(await loadPresets("/no")).toEqual({});
	});
	it("skips non-.md files", async () => {
		mockDir(["readme.txt"]);
		expect(await loadPresets("/d")).toEqual({});
		expect(rfS).not.toHaveBeenCalled();
	});
	it("loads valid .md preset", async () => {
		mockDir(["check.md"]);
		setup("Check PR");
		const r = await loadPresets("/d");
		expect(r.CHECK).toEqual({ defaultInterval: IV, description: "D", prompt: "Check PR" });
	});
	it("falls back to key as description and 5m as interval", async () => {
		mockDir(["pr.md"]);
		setup("text", {});
		const r = await loadPresets("/d");
		expect(r.PR.description).toBe("PR");
		expect(pi).toHaveBeenCalledWith("5m");
	});
	it("skips files with no body", async () => {
		mockDir(["e.md"]);
		setup("");
		expect(await loadPresets("/d")).toEqual({});
	});
	it("skips files with invalid interval", async () => {
		mockDir(["b.md"]);
		setup("text", { interval: "x" });
		expect(await loadPresets("/d")).toEqual({});
	});
	it("skips unreadable files", async () => {
		mockDir(["f.md"]);
		rfS.mockImplementation(() => { throw new Error("EACCES"); });
		expect(await loadPresets("/d")).toEqual({});
	});
});

describe("getPresetCompletions", () => {
	it("returns null when readdirSync throws", () => {
		rdS.mockImplementation(() => { throw new Error("ENOENT"); });
		expect(getPresetCompletions("/no", "")).toBeNull();
	});
	it("filters by prefix, skips non-.md and invalid presets", () => {
		mockDirSync(["check.md", "deploy.md", "skip.txt"]);
		rfS.mockReturnValueOnce("raw").mockReturnValueOnce("raw");
		fm.mockReturnValueOnce({ meta: { interval: "5m", description: "D" }, body: "b" })
			.mockReturnValueOnce({ meta: {}, body: "" });
		pi.mockReturnValueOnce(IV);
		const r = getPresetCompletions("/d", "ch");
		expect(r).toHaveLength(1);
		expect(r![0].value).toBe("CHECK");
	});
	it("returns null when no matches", () => {
		mockDirSync(["check.md"]);
		setup("body");
		expect(getPresetCompletions("/d", "zzz")).toBeNull();
	});
});
