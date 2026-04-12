import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { DEFAULT_ENABLED } from "../src/constants.js";
import { getConfigPath, loadGlobalState, saveGlobalState } from "../src/config.js";

describe("config", () => {
	it("builds config path under agent extensions dir", () => {
		expect(getConfigPath("/tmp/pi-agent")).toBe("/tmp/pi-agent/extensions/terse-mode.json");
	});

	it("returns default when config file is missing", async () => {
		const dir = await mkdtemp(join(tmpdir(), "terse-mode-"));
		try {
			await expect(loadGlobalState(join(dir, "missing.json"))).resolves.toBe(DEFAULT_ENABLED);
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});

	it("loads persisted enabled flag and saves back to disk", async () => {
		const dir = await mkdtemp(join(tmpdir(), "terse-mode-"));
		const path = getConfigPath(dir);
		try {
			await saveGlobalState(false, path);
			await expect(loadGlobalState(path)).resolves.toBe(false);
			await expect(readFile(path, "utf8")).resolves.toContain('"enabled": false');
			await expect(loadGlobalState(`${path}.tmp`)).resolves.toBe(DEFAULT_ENABLED);
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});

	it("falls back to default for invalid config content", async () => {
		const dir = await mkdtemp(join(tmpdir(), "terse-mode-"));
		const path = join(dir, "invalid.json");
		const malformedPath = join(dir, "malformed.json");
		const nullPath = join(dir, "null.json");
		try {
			await writeFile(path, '{"enabled":"nope"}\n', "utf8");
			await writeFile(malformedPath, "{", "utf8");
			await writeFile(nullPath, "null\n", "utf8");
			await expect(loadGlobalState(path)).resolves.toBe(DEFAULT_ENABLED);
			await expect(loadGlobalState(malformedPath)).resolves.toBe(DEFAULT_ENABLED);
			await expect(loadGlobalState(nullPath)).resolves.toBe(DEFAULT_ENABLED);
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});
});
