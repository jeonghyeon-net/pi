import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installFooter } from "../src/footer.js";
import { DIRTY_CHECK_INTERVAL_MS, PR_CHECK_INTERVAL_MS } from "../src/types.js";
import type { ExecFn } from "../src/types.js";
import { mockCtx, mockFooterData, mockTheme } from "./helpers.js";

describe("footer async edge cases", () => {
	beforeEach(() => { vi.useFakeTimers(); });
	afterEach(() => { vi.useRealTimers(); });
	it("does not render after dispose during async repo fetch", async () => {
		let resolve: ((v: { stdout: string; code: number }) => void) | undefined; const exec: ExecFn = vi.fn().mockImplementation(() => new Promise((r) => { resolve = r; }));
		const ctx = mockCtx(); installFooter(ctx, exec); const factory = vi.mocked(ctx.ui.setFooter).mock.calls[0][0]!, tui = { requestRender: vi.fn() }, c = factory(tui, mockTheme(), mockFooterData());
		c.dispose(); resolve?.({ stdout: "https://g.com/u/r.git\n", code: 0 }); await vi.advanceTimersByTimeAsync(0); expect(tui.requestRender).not.toHaveBeenCalled();
	});
	it("skips dirty check while previous run is active", async () => {
		let resolve: ((v: { stdout: string; code: number }) => void) | undefined; const exec: ExecFn = vi.fn().mockResolvedValueOnce({ stdout: "", code: 0 }).mockImplementationOnce(() => new Promise((r) => { resolve = r; })).mockResolvedValue({ stdout: "", code: 0 });
		const ctx = mockCtx(); installFooter(ctx, exec); const factory = vi.mocked(ctx.ui.setFooter).mock.calls[0][0]!, c = factory({ requestRender: vi.fn() }, mockTheme(), mockFooterData());
		await vi.advanceTimersByTimeAsync(0); const before = vi.mocked(exec).mock.calls.length; await vi.advanceTimersByTimeAsync(DIRTY_CHECK_INTERVAL_MS); expect(vi.mocked(exec).mock.calls.length).toBe(before); resolve?.({ stdout: "", code: 0 }); await vi.advanceTimersByTimeAsync(0); c.dispose();
	});
	it("skips PR check while previous run is active", async () => {
		let ghResolve: ((v: { stdout: string; code: number }) => void) | undefined; const exec: ExecFn = vi.fn().mockImplementation((command, args) => command === "gh" ? new Promise((r) => { ghResolve = r; }) : Promise.resolve({ stdout: "", code: 0 }));
		const ctx = mockCtx(); installFooter(ctx, exec); const factory = vi.mocked(ctx.ui.setFooter).mock.calls[0][0]!, c = factory({ requestRender: vi.fn() }, mockTheme(), mockFooterData());
		await vi.advanceTimersByTimeAsync(0); const before = vi.mocked(exec).mock.calls.filter(([command]) => command === "gh").length; await vi.advanceTimersByTimeAsync(PR_CHECK_INTERVAL_MS); const after = vi.mocked(exec).mock.calls.filter(([command]) => command === "gh").length; expect(after).toBe(before); ghResolve?.({ stdout: "[]", code: 0 }); await vi.advanceTimersByTimeAsync(0); c.dispose();
	});
	it("handles git and gh rejections", async () => {
		const gitExec: ExecFn = vi.fn().mockResolvedValueOnce({ stdout: "", code: 0 }).mockRejectedValueOnce(new Error("err")).mockResolvedValue({ stdout: "", code: 0 });
		const gitCtx = mockCtx(); installFooter(gitCtx, gitExec); const gitFactory = vi.mocked(gitCtx.ui.setFooter).mock.calls[0][0]!, gitC = gitFactory({ requestRender: vi.fn() }, mockTheme(), mockFooterData());
		await vi.advanceTimersByTimeAsync(0); await vi.advanceTimersByTimeAsync(DIRTY_CHECK_INTERVAL_MS); gitC.dispose();
		const ghExec: ExecFn = vi.fn().mockImplementation(async (command) => command === "gh" ? Promise.reject(new Error("gh failed")) : { stdout: "", code: 0 });
		const ghCtx = mockCtx(); installFooter(ghCtx, ghExec); const ghFactory = vi.mocked(ghCtx.ui.setFooter).mock.calls[0][0]!, ghC = ghFactory({ requestRender: vi.fn() }, mockTheme(), mockFooterData());
		await vi.advanceTimersByTimeAsync(0); await vi.advanceTimersByTimeAsync(PR_CHECK_INTERVAL_MS); ghC.dispose();
	});
});
