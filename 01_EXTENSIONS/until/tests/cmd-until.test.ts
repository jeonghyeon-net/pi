import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../src/register.js", () => ({ registerTask: vi.fn() }));
vi.mock("../src/presets.js", () => ({ loadPresets: vi.fn(), getPresetCompletions: vi.fn() }));
vi.mock("../src/interval.js", () => ({ parseInterval: vi.fn() }));
vi.mock("node:fs", () => ({ existsSync: vi.fn() }));

import { createUntilCommand } from "../src/cmd-until.js";
import { registerTask } from "../src/register.js";
import { loadPresets, getPresetCompletions } from "../src/presets.js";
import { parseInterval } from "../src/interval.js";
import { existsSync } from "node:fs";

const ctx = { ui: { notify: vi.fn() } };
const preset = { defaultInterval: { ms: 300000, label: "5분" }, prompt: "check PR", description: "Check PR" };
const cmd = () => createUntilCommand();

beforeEach(() => vi.clearAllMocks());

describe("handler", () => {
	it("empty args shows help with presets", async () => {
		vi.mocked(loadPresets).mockResolvedValue({ PR: preset });
		await cmd().handler("", ctx);
		expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringContaining("PR"), "warning");
	});
	it("empty args with no presets shows basic usage", async () => {
		vi.mocked(loadPresets).mockResolvedValue({});
		await cmd().handler("", ctx);
		expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringContaining("사용법"), "warning");
	});
	it("direct preset match calls registerTask", async () => {
		vi.mocked(loadPresets).mockResolvedValue({ PR: preset });
		await cmd().handler("PR", ctx);
		expect(registerTask).toHaveBeenCalledWith(300000, "5분", "check PR", expect.any(Function));
	});
	it("preset file exists but failed to load shows error", async () => {
		vi.mocked(loadPresets).mockResolvedValue({});
		vi.mocked(existsSync).mockReturnValue(true);
		await cmd().handler("PR", ctx);
		expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringContaining("로드에 실패"), "error");
	});
	it("no space and no preset match shows error", async () => {
		vi.mocked(loadPresets).mockResolvedValue({});
		vi.mocked(existsSync).mockReturnValue(false);
		await cmd().handler("nope", ctx);
		expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringContaining("프롬프트가 필요해"), "error");
	});
	it("valid interval + prompt calls registerTask", async () => {
		vi.mocked(loadPresets).mockResolvedValue({});
		vi.mocked(parseInterval).mockReturnValue({ ms: 300000, label: "5분" });
		await cmd().handler("5m check stuff", ctx);
		expect(registerTask).toHaveBeenCalledWith(300000, "5분", "check stuff", expect.any(Function));
	});
	it("invalid interval shows parse error", async () => {
		vi.mocked(loadPresets).mockResolvedValue({});
		vi.mocked(existsSync).mockReturnValue(false);
		vi.mocked(parseInterval).mockReturnValue(null);
		await cmd().handler("xyz hello", ctx);
		expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringContaining("파싱할 수 없어"), "error");
	});
	it("interval + preset name uses preset prompt with custom interval", async () => {
		vi.mocked(loadPresets).mockResolvedValue({ PR: preset });
		vi.mocked(parseInterval).mockReturnValue({ ms: 600000, label: "10분" });
		await cmd().handler("10m PR", ctx);
		expect(registerTask).toHaveBeenCalledWith(600000, "10분", "check PR", expect.any(Function));
	});
	it("empty rest after interval shows error", async () => {
		vi.mocked(loadPresets).mockResolvedValue({});
		vi.mocked(parseInterval).mockReturnValue({ ms: 300000, label: "5분" });
		await cmd().handler("5m  ", ctx);
		expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringContaining("프롬프트가 필요해"), "error");
	});
});

describe("getArgumentCompletions", () => {
	it("delegates to getPresetCompletions for first token", () => {
		vi.mocked(parseInterval).mockReturnValue(null);
		vi.mocked(getPresetCompletions).mockReturnValue([{ value: "PR", label: "PR" }]);
		const result = cmd().getArgumentCompletions("P");
		expect(getPresetCompletions).toHaveBeenCalledWith(expect.any(String), "P");
		expect(result).toEqual([{ value: "PR", label: "PR" }]);
	});
	it("delegates for second token after valid interval", () => {
		vi.mocked(parseInterval).mockReturnValue({ ms: 300000, label: "5분" });
		vi.mocked(getPresetCompletions).mockReturnValue([{ value: "PR", label: "PR" }]);
		const result = cmd().getArgumentCompletions("5m P");
		expect(getPresetCompletions).toHaveBeenCalledWith(expect.any(String), "P");
		expect(result).toEqual([{ value: "PR", label: "PR" }]);
	});
	it("returns null when first token is not interval and has space", () => {
		vi.mocked(parseInterval).mockReturnValue(null);
		expect(cmd().getArgumentCompletions("foo bar")).toBeNull();
	});
	it("returns null when interval + rest has space", () => {
		vi.mocked(parseInterval).mockReturnValue({ ms: 300000, label: "5분" });
		expect(cmd().getArgumentCompletions("5m foo bar")).toBeNull();
	});
});
