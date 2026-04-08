import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installFooter } from "../src/footer.js";
import { DIRTY_CHECK_INTERVAL_MS, PR_CHECK_INTERVAL_MS } from "../src/types.js";
import type { ExecFn } from "../src/types.js";
import { mockCtx, mockFooterData, mockTheme, mockExec } from "./helpers.js";

describe("footer branch-driven updates", () => {
	beforeEach(() => { vi.useFakeTimers(); });
	afterEach(() => { vi.useRealTimers(); });
	it("resets dirty flag when branch is null", async () => {
		const ctx = mockCtx(); installFooter(ctx, mockExec()); const factory = vi.mocked(ctx.ui.setFooter).mock.calls[0][0]!;
		const tui = { requestRender: vi.fn() }, c = factory(tui, mockTheme(), mockFooterData({ getGitBranch: () => null }));
		await vi.advanceTimersByTimeAsync(0); expect(tui.requestRender).toHaveBeenCalled(); tui.requestRender.mockClear(); await vi.advanceTimersByTimeAsync(DIRTY_CHECK_INTERVAL_MS); expect(tui.requestRender).not.toHaveBeenCalled(); c.dispose();
	});
	it("runs periodic dirty checks", async () => {
		const exec = mockExec(); const ctx = mockCtx(); installFooter(ctx, exec); const factory = vi.mocked(ctx.ui.setFooter).mock.calls[0][0]!, c = factory({ requestRender: vi.fn() }, mockTheme(), mockFooterData());
		await vi.advanceTimersByTimeAsync(0); vi.mocked(exec).mockClear(); await vi.advanceTimersByTimeAsync(DIRTY_CHECK_INTERVAL_MS); expect(exec).toHaveBeenCalled(); c.dispose();
	});
	it("clears PR state when branch disappears", async () => {
		let branch: string | null = "main"; const exec: ExecFn = vi.fn().mockImplementation(async (command) => command === "gh" ? { stdout: JSON.stringify([{ reviewDecision: "APPROVED", mergeStateStatus: "CLEAN" }]), code: 0 } : { stdout: "", code: 0 });
		const ctx = mockCtx({ sessionManager: { getCwd: () => "/t", getSessionName: () => "s" } }); installFooter(ctx, exec); const factory = vi.mocked(ctx.ui.setFooter).mock.calls[0][0]!;
		const tui = { requestRender: vi.fn() }, c = factory(tui, mockTheme(), mockFooterData({ getGitBranch: () => branch }));
		await vi.advanceTimersByTimeAsync(0); expect(c.render(120)[0]).toContain("approved"); branch = null; tui.requestRender.mockClear(); await vi.advanceTimersByTimeAsync(PR_CHECK_INTERVAL_MS); expect(tui.requestRender).toHaveBeenCalled(); expect(c.render(120)[0]).not.toContain("approved"); c.dispose();
	});
});
