import { describe, it, expect, vi } from "vitest";
import { createLogger } from "../src/logger.js";

describe("createLogger", () => {
	it("logs info and above at info level", () => {
		const spy = vi.spyOn(console, "log").mockImplementation(() => {});
		const logger = createLogger("info");
		logger.debug("hidden");
		expect(spy).not.toHaveBeenCalled();
		logger.info("visible");
		expect(spy).toHaveBeenCalledWith("[mcp:info] visible");
		spy.mockRestore();
	});

	it("uses console.error for error level", () => {
		const spy = vi.spyOn(console, "error").mockImplementation(() => {});
		const logger = createLogger("debug");
		logger.error("fail");
		expect(spy).toHaveBeenCalledWith("[mcp:error] fail");
		spy.mockRestore();
	});

	it("uses console.warn for warn level", () => {
		const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
		const logger = createLogger("debug");
		logger.warn("caution");
		expect(spy).toHaveBeenCalledWith("[mcp:warn] caution");
		spy.mockRestore();
	});

	it("logs debug at debug level", () => {
		const spy = vi.spyOn(console, "log").mockImplementation(() => {});
		const logger = createLogger("debug");
		logger.debug("trace");
		expect(spy).toHaveBeenCalledWith("[mcp:debug] trace");
		spy.mockRestore();
	});

	it("child logger inherits and extends context", () => {
		const spy = vi.spyOn(console, "log").mockImplementation(() => {});
		const logger = createLogger("debug", { server: "gh" });
		const child = logger.child({ op: "list" });
		child.info("ok");
		expect(spy).toHaveBeenCalledWith("[mcp:info] ok (server=gh op=list)");
		spy.mockRestore();
	});

	it("child logger overrides parent context keys", () => {
		const spy = vi.spyOn(console, "log").mockImplementation(() => {});
		const logger = createLogger("debug", { server: "old" });
		const child = logger.child({ server: "new" });
		child.info("msg");
		expect(spy).toHaveBeenCalledWith("[mcp:info] msg (server=new)");
		spy.mockRestore();
	});

	it("respects minLevel for all methods", () => {
		const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
		const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
		const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		const logger = createLogger("error");
		logger.debug("no"); logger.info("no"); logger.warn("no");
		expect(logSpy).not.toHaveBeenCalled();
		expect(warnSpy).not.toHaveBeenCalled();
		logger.error("yes");
		expect(errSpy).toHaveBeenCalled();
		logSpy.mockRestore(); warnSpy.mockRestore(); errSpy.mockRestore();
	});
});
