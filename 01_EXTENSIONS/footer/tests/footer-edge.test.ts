import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { installFooter, teardownFooter } from "../src/footer.js";
import { DIRTY_CHECK_INTERVAL_MS, BAR_WIDTH, NAME_STATUS_KEY, STATUS_STYLE_MAP } from "../src/types.js";
import type { ExecFn } from "../src/types.js";
import { mockTheme, mockFooterData, mockCtx } from "./helpers.js";

describe("installFooter edge cases", () => {
	beforeEach(() => { vi.useFakeTimers(); });
	afterEach(() => { vi.useRealTimers(); });

	it("no requestRender after dispose during async", async () => {
		const ctx = mockCtx();
		let resolve: ((v: { stdout: string; code: number }) => void) | undefined;
		const exec: ExecFn = vi.fn().mockImplementation(() => new Promise((r) => { resolve = r; }));
		installFooter(ctx, exec);
		const f = vi.mocked(ctx.ui.setFooter).mock.calls[0][0]!;
		const tui = { requestRender: vi.fn() };
		const c = f(tui, mockTheme(), mockFooterData());
		c.dispose();
		resolve?.({ stdout: "https://g.com/u/r.git\n", code: 0 });
		await vi.advanceTimersByTimeAsync(0);
		expect(tui.requestRender).not.toHaveBeenCalled();
	});

	it("skips dirty check when previous still running", async () => {
		const ctx = mockCtx();
		let resolve: ((v: { stdout: string; code: number }) => void) | undefined;
		const exec: ExecFn = vi.fn()
			.mockResolvedValueOnce({ stdout: "", code: 0 })
			.mockImplementationOnce(() => new Promise((r) => { resolve = r; }))
			.mockResolvedValue({ stdout: "", code: 0 });
		installFooter(ctx, exec);
		const f = vi.mocked(ctx.ui.setFooter).mock.calls[0][0]!;
		const c = f({ requestRender: vi.fn() }, mockTheme(), mockFooterData());
		await vi.advanceTimersByTimeAsync(0);
		const before = vi.mocked(exec).mock.calls.length;
		await vi.advanceTimersByTimeAsync(DIRTY_CHECK_INTERVAL_MS);
		expect(vi.mocked(exec).mock.calls.length).toBe(before);
		resolve?.({ stdout: "", code: 0 });
		await vi.advanceTimersByTimeAsync(0);
		c.dispose();
	});

	it("handles git exec rejection", async () => {
		const ctx = mockCtx();
		const exec: ExecFn = vi.fn()
			.mockResolvedValueOnce({ stdout: "", code: 0 })
			.mockRejectedValueOnce(new Error("err"))
			.mockResolvedValue({ stdout: "", code: 0 });
		installFooter(ctx, exec);
		const f = vi.mocked(ctx.ui.setFooter).mock.calls[0][0]!;
		const c = f({ requestRender: vi.fn() }, mockTheme(), mockFooterData());
		await vi.advanceTimersByTimeAsync(0);
		await vi.advanceTimersByTimeAsync(DIRTY_CHECK_INTERVAL_MS);
		c.dispose();
	});
});

describe("teardownFooter", () => {
	it("calls setFooter(undefined) when hasUI", () => {
		const ctx = mockCtx();
		teardownFooter(ctx);
		expect(ctx.ui.setFooter).toHaveBeenCalledWith(undefined);
	});
	it("skips when hasUI is false", () => {
		const ctx = mockCtx({ hasUI: false });
		teardownFooter(ctx);
		expect(ctx.ui.setFooter).not.toHaveBeenCalled();
	});
});

describe("constants", () => {
	it("BAR_WIDTH", () => { expect(BAR_WIDTH).toBe(10); });
	it("DIRTY_CHECK_INTERVAL_MS", () => { expect(DIRTY_CHECK_INTERVAL_MS).toBe(3000); });
	it("NAME_STATUS_KEY", () => { expect(NAME_STATUS_KEY).toBe("session-name"); });
	it("STATUS_STYLE_MAP", () => { expect(STATUS_STYLE_MAP).toHaveProperty(NAME_STATUS_KEY); });
});
