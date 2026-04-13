import { beforeEach, describe, expect, it, vi } from "vitest";
import { createAgentEndHandler, createInputHandler, createSessionShutdownHandler, createSessionStartHandler, createSessionTreeHandler, createTurnEndHandler } from "../src/hooks.js";
import { stubContext, stubRuntime } from "./helpers.js";

const { clearOverviewUi, previewOverviewFromInput, refreshOverview, restoreOverview } = vi.hoisted(() => ({
	clearOverviewUi: vi.fn(),
	previewOverviewFromInput: vi.fn(),
	refreshOverview: vi.fn(),
	restoreOverview: vi.fn(),
}));

vi.mock("../src/handlers.js", async () => {
	const actual = await vi.importActual<typeof import("../src/handlers.js")>("../src/handlers.js");
	return { ...actual, clearOverviewUi, previewOverviewFromInput, refreshOverview, restoreOverview };
});

describe("hooks", () => {
	beforeEach(() => {
		clearOverviewUi.mockReset();
		previewOverviewFromInput.mockReset();
		refreshOverview.mockReset();
		restoreOverview.mockReset();
		refreshOverview.mockResolvedValue(undefined);
	});

	it("previews only the first interactive input in a view", async () => {
		const ctx = stubContext();
		previewOverviewFromInput.mockReturnValue(true);
		await createInputHandler()({ text: "요약 오버레이를 크게 만들어줘", source: "interactive" }, ctx);
		expect(previewOverviewFromInput).toHaveBeenCalledWith(ctx, "요약 오버레이를 크게 만들어줘");
		await createInputHandler()({ text: "둘째 입력", source: "interactive" }, ctx);
		await createInputHandler()({ text: "rpc 입력", source: "rpc" }, ctx);
		expect(previewOverviewFromInput).toHaveBeenCalledTimes(1);
	});

	it("restores the overview on session start and tree navigation", async () => {
		const runtime = stubRuntime();
		const ctx = stubContext();
		await createSessionStartHandler(runtime.getSessionName, runtime.setSessionName, runtime.appendEntry)({}, ctx);
		const startRuntime = restoreOverview.mock.calls[0][0];
		expect(startRuntime.isActive()).toBe(true);
		await createSessionTreeHandler(runtime.getSessionName, runtime.setSessionName, runtime.appendEntry)({}, ctx);
		expect(startRuntime.isActive()).toBe(false);
		expect(restoreOverview).toHaveBeenCalledTimes(2);
	});

	it("queues agent_end refresh in background, publishes pending work, and invalidates queued work on tree moves", async () => {
		let release!: () => void;
		refreshOverview.mockImplementationOnce(() => new Promise((done) => { release = () => done(undefined); }));
		const events = { emit: vi.fn() };
		const runtime = stubRuntime();
		const idleCtx = stubContext();
		const result = createAgentEndHandler(runtime.getSessionName, runtime.setSessionName, runtime.appendEntry, events)({}, idleCtx);
		expect(result).toBeUndefined();
		expect(refreshOverview).toHaveBeenCalledWith(expect.any(Set), expect.objectContaining({ getSessionName: runtime.getSessionName, setSessionName: runtime.setSessionName, appendEntry: runtime.appendEntry }), idleCtx);
		expect(events.emit).toHaveBeenCalledWith("auto-session-title:overview-refresh-queued", { sessionId: "session-1", pending: expect.any(Promise) });
		release();
		await Promise.resolve();
		const queuedCtx = stubContext([], { hasPendingMessages: vi.fn(() => true) });
		await createTurnEndHandler(runtime.getSessionName, runtime.setSessionName, runtime.appendEntry)({}, queuedCtx);
		const queuedRuntime = refreshOverview.mock.calls[1][1];
		await createSessionTreeHandler(runtime.getSessionName, runtime.setSessionName, runtime.appendEntry)({}, queuedCtx);
		expect(queuedRuntime.isActive()).toBe(false);
	});

	it("reuses pending refresh promise while overview refresh is already running", async () => {
		let release!: () => void;
		refreshOverview.mockImplementationOnce(() => new Promise((done) => { release = () => done(undefined); }));
		refreshOverview.mockResolvedValue(undefined);
		const events = { emit: vi.fn() };
		const runtime = stubRuntime();
		const ctx = stubContext();
		createAgentEndHandler(runtime.getSessionName, runtime.setSessionName, runtime.appendEntry, events)({}, ctx);
		createAgentEndHandler(runtime.getSessionName, runtime.setSessionName, runtime.appendEntry, events)({}, ctx);
		expect(events.emit.mock.calls[0][1].pending).toBe(events.emit.mock.calls[1][1].pending);
		await createSessionShutdownHandler()({}, ctx);
		release();
		await Promise.resolve();
	});

	it("clears overview UI on session shutdown", async () => {
		const ctx = stubContext();
		await createSessionShutdownHandler()({}, ctx);
		expect(clearOverviewUi).toHaveBeenCalledWith(expect.any(Set), ctx);
	});
});
