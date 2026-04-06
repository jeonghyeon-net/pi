import { describe, it, expect, vi } from "vitest";
vi.mock("../src/spawn.js", () => ({ spawnAndCollect: vi.fn() }));
import { createTool } from "../src/tool.js";

const stubPi = () => ({ appendEntry: vi.fn() });
const stubCtx = () => ({ hasUI: false, ui: { setWidget: vi.fn() }, sessionManager: { getBranch: () => [] } });

describe("createTool renderCall/renderResult", () => {
	it("renderCall returns component", () => {
		const tool = createTool(stubPi(), "/nonexistent");
		const comp = tool.renderCall({ command: "run scout -- hello" });
		expect(comp.render(80)).toBeInstanceOf(Array);
		expect(comp.render(80)[0]).toContain("scout");
	});

	it("renderResult returns component", () => {
		const tool = createTool(stubPi(), "/nonexistent");
		const comp = tool.renderResult({ content: [{ type: "text", text: "done" }] });
		expect(comp.render(80)).toEqual(["done"]);
	});
});
