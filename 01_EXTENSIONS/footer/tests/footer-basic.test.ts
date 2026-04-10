import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installFooter, teardownFooter } from "../src/footer.js";
import { DIRTY_CHECK_INTERVAL_MS, NAME_STATUS_KEY, PR_CHECK_INTERVAL_MS, STATUS_STYLE_MAP, BAR_WIDTH } from "../src/types.js";
import type { ExecFn } from "../src/types.js";
import { mockCtx, mockExec, mockFooterData, mockTheme } from "./helpers.js";

function setup(ctx = mockCtx(), exec: ExecFn = mockExec()) {
	installFooter(ctx, exec);
	return { ctx, exec, factory: vi.mocked(ctx.ui.setFooter).mock.calls[0][0]! };
}

describe("footer basic behavior", () => {
	beforeEach(() => { vi.useFakeTimers(); });
	afterEach(() => { vi.useRealTimers(); });
	it("skips without UI", () => { const ctx = mockCtx({ hasUI: false }); installFooter(ctx, mockExec()); expect(ctx.ui.setFooter).not.toHaveBeenCalled(); });
	it("installs footer factory", () => { const { ctx } = setup(); expect(ctx.ui.setFooter).toHaveBeenCalledWith(expect.any(Function)); });
	it("creates component", () => { const { factory } = setup(); const c = factory({ requestRender: vi.fn() }, mockTheme(), mockFooterData()); expect(typeof c.render).toBe("function"); c.invalidate(); c.dispose(); });
	it("renders model on first line", () => { const { factory } = setup(); const c = factory({ requestRender: vi.fn() }, mockTheme(), mockFooterData()); expect(c.render(120)[0]).toContain("claude-opus-4-6"); c.dispose(); });
	it("does not add a second footer line just for the session name", () => {
		const { factory } = setup(mockCtx({ sessionManager: { getCwd: () => "/t", getSessionName: () => "s" } }));
		const c = factory({ requestRender: vi.fn() }, mockTheme(), mockFooterData());
		expect(c.render(120)).toHaveLength(1);
		c.dispose();
	});
	it("renders a second line when extension statuses exist", () => {
		const { factory } = setup();
		const c = factory({ requestRender: vi.fn() }, mockTheme(), mockFooterData({ getExtensionStatuses: () => new Map([["todo", "doing"]]) }));
		expect(c.render(120)).toHaveLength(2);
		c.dispose();
	});
	it("renders PR review and merge on first line", async () => {
		const exec: ExecFn = vi.fn().mockImplementation(async (command, args) => command === "gh" ? { stdout: JSON.stringify([{ reviewDecision: "APPROVED", mergeStateStatus: "CLEAN" }]), code: 0 } : command === "git" && args[0] === "remote" ? { stdout: "https://g.com/u/r.git\n", code: 0 } : { stdout: "", code: 0 });
		const { factory } = setup(mockCtx({ sessionManager: { getCwd: () => "/t", getSessionName: () => "s" } }), exec);
		const c = factory({ requestRender: vi.fn() }, mockTheme(), mockFooterData()); await vi.advanceTimersByTimeAsync(0); const lines = c.render(120);
		expect(lines[0]).toContain("approved"); expect(lines[0]).toContain("mergeable"); expect(lines).toHaveLength(1); c.dispose();
	});
	it("unsubscribes branch listener on dispose", () => { const unsub = vi.fn(); const { factory } = setup(); const c = factory({ requestRender: vi.fn() }, mockTheme(), mockFooterData({ onBranchChange: () => unsub })); c.dispose(); expect(unsub).toHaveBeenCalled(); });
	it("refreshes repo name on branch change", async () => {
		let bl: (() => void) | undefined; const exec = mockExec({ stdout: "https://g.com/u/r.git\n", code: 0 });
		const { factory } = setup(mockCtx(), exec); const c = factory({ requestRender: vi.fn() }, mockTheme(), mockFooterData({ onBranchChange: (l) => { bl = l; return () => {}; } }));
		await vi.advanceTimersByTimeAsync(0); expect(c.render(120)[0]).toContain("r"); vi.mocked(exec).mockClear(); bl?.(); await vi.advanceTimersByTimeAsync(0); expect(exec).toHaveBeenCalled(); c.dispose();
	});
	it("stops timers after dispose", async () => { const exec = mockExec(); const { factory } = setup(mockCtx(), exec); const c = factory({ requestRender: vi.fn() }, mockTheme(), mockFooterData()); await vi.advanceTimersByTimeAsync(0); c.dispose(); vi.mocked(exec).mockClear(); await vi.advanceTimersByTimeAsync(DIRTY_CHECK_INTERVAL_MS + PR_CHECK_INTERVAL_MS); expect(exec).not.toHaveBeenCalled(); });
});

describe("footer teardown and constants", () => {
	it("teardown clears footer", () => { const ctx = mockCtx(); teardownFooter(ctx); expect(ctx.ui.setFooter).toHaveBeenCalledWith(undefined); });
	it("teardown skips without UI", () => { const ctx = mockCtx({ hasUI: false }); teardownFooter(ctx); expect(ctx.ui.setFooter).not.toHaveBeenCalled(); });
	it("exports expected constants", () => { expect(BAR_WIDTH).toBe(10); expect(DIRTY_CHECK_INTERVAL_MS).toBe(3000); expect(PR_CHECK_INTERVAL_MS).toBe(15000); expect(NAME_STATUS_KEY).toBe("session-name"); expect(STATUS_STYLE_MAP).toHaveProperty(NAME_STATUS_KEY); });
});
