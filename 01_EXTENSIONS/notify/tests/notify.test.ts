import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { notify } from "../src/notify.js";

describe("notify", () => {
	let writeSpy: ReturnType<typeof vi.fn>;
	const originalEnv = process.env;

	beforeEach(() => {
		writeSpy = vi.spyOn(process.stdout, "write").mockReturnValue(true);
		process.env = { ...originalEnv };
		delete process.env.KITTY_WINDOW_ID;
	});

	afterEach(() => {
		writeSpy.mockRestore();
		process.env = originalEnv;
	});

	it("OSC 777 by default", () => {
		notify("Pi", "Ready");
		expect(writeSpy).toHaveBeenCalledWith("\x1b]777;notify;Pi;Ready\x07");
	});

	it("OSC 99 when KITTY_WINDOW_ID is set", () => {
		process.env.KITTY_WINDOW_ID = "1";
		notify("Pi", "Ready");
		expect(writeSpy).toHaveBeenCalledWith("\x1b]99;i=1:d=0;Pi\x1b\\");
		expect(writeSpy).toHaveBeenCalledWith("\x1b]99;i=1:p=body;Ready\x1b\\");
	});
});
