import { describe, it, expect, vi } from "vitest";
import { createLogger } from "../src/logger.js";

describe("createLogger", () => {
	it("info logs at info level via console.log", () => {
		const spy = vi.spyOn(console, "log").mockImplementation(() => {});
		const logger = createLogger("info");
		logger.info("hello");
		expect(spy).toHaveBeenCalledWith("[mcp:info] hello");
		spy.mockRestore();
	});

	it("debug is skipped at info level", () => {
		const spy = vi.spyOn(console, "log").mockImplementation(() => {});
		const logger = createLogger("info");
		logger.debug("hidden");
		expect(spy).not.toHaveBeenCalled();
		spy.mockRestore();
	});

	it("error uses console.error", () => {
		const spy = vi.spyOn(console, "error").mockImplementation(() => {});
		const logger = createLogger("debug");
		logger.error("fail");
		expect(spy).toHaveBeenCalledWith("[mcp:error] fail");
		spy.mockRestore();
	});

	it("warn uses console.warn", () => {
		const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
		const logger = createLogger("debug");
		logger.warn("careful");
		expect(spy).toHaveBeenCalledWith("[mcp:warn] careful");
		spy.mockRestore();
	});

	it("debug logs at debug level via console.log", () => {
		const spy = vi.spyOn(console, "log").mockImplementation(() => {});
		const logger = createLogger("debug");
		logger.debug("trace");
		expect(spy).toHaveBeenCalledWith("[mcp:debug] trace");
		spy.mockRestore();
	});

	it("child logger inherits and extends context", () => {
		const spy = vi.spyOn(console, "log").mockImplementation(() => {});
		const parent = createLogger("info", { ext: "mcp" });
		const child = parent.child({ req: "123" });
		child.info("request");
		expect(spy).toHaveBeenCalledWith("[mcp:info] request (ext=mcp req=123)");
		spy.mockRestore();
	});

	it("child logger overrides parent context keys", () => {
		const spy = vi.spyOn(console, "log").mockImplementation(() => {});
		const parent = createLogger("info", { key: "old" });
		const child = parent.child({ key: "new" });
		child.info("msg");
		expect(spy).toHaveBeenCalledWith("[mcp:info] msg (key=new)");
		spy.mockRestore();
	});

	it("parent logger without context still works", () => {
		const spy = vi.spyOn(console, "log").mockImplementation(() => {});
		const logger = createLogger("debug");
		const child = logger.child({ id: "abc" });
		child.info("test");
		expect(spy).toHaveBeenCalledWith("[mcp:info] test (id=abc)");
		spy.mockRestore();
	});
});
