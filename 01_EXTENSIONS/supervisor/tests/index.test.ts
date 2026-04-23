import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";

const runSupervisor = vi.fn();
vi.mock("@jeonghyeon.net/pi-supervisor/src/index", () => ({ default: runSupervisor }));

import extension from "../src/index.ts";

describe("supervisor index", () => {
	it("exports an extension function", async () => {
		expect(typeof extension).toBe("function");
		await extension({} as ExtensionAPI);
		expect(runSupervisor).toHaveBeenCalledTimes(1);
	});
});
