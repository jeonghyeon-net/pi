import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { installFooter } from "../src/footer.js";
import { DIRTY_CHECK_INTERVAL_MS } from "../src/types.js";
import type { ExecFn } from "../src/types.js";
import { mockTheme, mockFooterData, mockCtx, mockExec } from "./helpers.js";

function setup(ctx = mockCtx(), exec: ExecFn = mockExec()) {
	installFooter(ctx, exec);
	const factory = vi.mocked(ctx.ui.setFooter).mock.calls[0][0]!;
	return { ctx, exec, factory };
}

describe("installFooter", () => {
	beforeEach(() => { vi.useFakeTimers(); });
	afterEach(() => { vi.useRealTimers(); });

	it("skips when hasUI is false", () => {
		const ctx = mockCtx({ hasUI: false });
		installFooter(ctx, mockExec());
		expect(ctx.ui.setFooter).not.toHaveBeenCalled();
	});
	it("calls setFooter with factory", () => {
		const { ctx } = setup();
		expect(ctx.ui.setFooter).toHaveBeenCalledWith(expect.any(Function));
	});
	it("factory returns valid component", () => {
		const { factory } = setup();
		const c = factory({ requestRender: vi.fn() }, mockTheme(), mockFooterData());
		expect(typeof c.render).toBe("function");
		c.invalidate();
		c.dispose();
	});
	it("render returns lines with model id", () => {
		const { factory } = setup();
		const c = factory({ requestRender: vi.fn() }, mockTheme(), mockFooterData());
		expect(c.render(120)[0]).toContain("claude-opus-4-6");
		c.dispose();
	});
	it("render shows second line for statuses", () => {
		const ctx = mockCtx({ sessionManager: { getCwd: () => "/t", getSessionName: () => "s" } });
		const { factory } = setup(ctx);
		const c = factory({ requestRender: vi.fn() }, mockTheme(), mockFooterData());
		expect(c.render(120).length).toBe(2);
		c.dispose();
	});
	it("dispose unsubscribes branch listener", () => {
		const unsub = vi.fn();
		const { factory } = setup();
		const c = factory({ requestRender: vi.fn() }, mockTheme(), mockFooterData({ onBranchChange: () => unsub }));
		c.dispose();
		expect(unsub).toHaveBeenCalled();
	});
	it("fetches repo name and refreshes on branch change", async () => {
		let bl: (() => void) | undefined;
		const exec = mockExec({ stdout: "https://g.com/u/r.git\n", code: 0 });
		const { factory } = setup(mockCtx(), exec);
		const fd = mockFooterData({ onBranchChange: (l) => { bl = l; return () => {}; } });
		const c = factory({ requestRender: vi.fn() }, mockTheme(), fd);
		await vi.advanceTimersByTimeAsync(0);
		expect(c.render(120)[0]).toContain("r");
		vi.mocked(exec).mockClear();
		bl?.();
		await vi.advanceTimersByTimeAsync(0);
		expect(exec).toHaveBeenCalled();
		c.dispose();
	});
	it("resets dirty flag when branch is null", async () => {
		const { factory } = setup();
		const tui = { requestRender: vi.fn() };
		const c = factory(tui, mockTheme(), mockFooterData({ getGitBranch: () => null }));
		await vi.advanceTimersByTimeAsync(0);
		expect(tui.requestRender).toHaveBeenCalled();
		tui.requestRender.mockClear();
		await vi.advanceTimersByTimeAsync(DIRTY_CHECK_INTERVAL_MS);
		expect(tui.requestRender).not.toHaveBeenCalled();
		c.dispose();
	});
	it("stops checks after dispose", async () => {
		const exec = mockExec();
		const { factory } = setup(mockCtx(), exec);
		const c = factory({ requestRender: vi.fn() }, mockTheme(), mockFooterData());
		await vi.advanceTimersByTimeAsync(0);
		c.dispose();
		vi.mocked(exec).mockClear();
		await vi.advanceTimersByTimeAsync(DIRTY_CHECK_INTERVAL_MS);
		expect(exec).not.toHaveBeenCalled();
	});
	it("periodic dirty check runs", async () => {
		const exec = mockExec();
		const { factory } = setup(mockCtx(), exec);
		const c = factory({ requestRender: vi.fn() }, mockTheme(), mockFooterData());
		await vi.advanceTimersByTimeAsync(0);
		vi.mocked(exec).mockClear();
		await vi.advanceTimersByTimeAsync(DIRTY_CHECK_INTERVAL_MS);
		expect(exec).toHaveBeenCalled();
		c.dispose();
	});
});
