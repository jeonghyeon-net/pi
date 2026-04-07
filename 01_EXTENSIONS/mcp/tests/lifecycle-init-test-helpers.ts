import { vi } from "vitest";
import { onSessionStart } from "../src/lifecycle-init.js";
import type { InitDeps } from "../src/lifecycle-init.js";

export const mockPi = () => ({ registerTool: vi.fn(), exec: vi.fn(), sendMessage: vi.fn() });

export function makeDeps(overrides?: Partial<InitDeps>): InitDeps {
	return {
		loadConfig: vi.fn().mockResolvedValue({ mcpServers: { s1: { lifecycle: "eager" } } }),
		mergeConfigs: vi.fn().mockImplementation((c) => c),
		applyDirectToolsEnv: vi.fn().mockImplementation((c) => c),
		computeHash: vi.fn().mockReturnValue("hash1"), loadCache: vi.fn().mockReturnValue(null),
		isCacheValid: vi.fn().mockReturnValue(false), saveCache: vi.fn().mockResolvedValue(undefined),
		connectServer: vi.fn().mockResolvedValue({ name: "s1", client: {}, status: "connected" }),
		buildMetadata: vi.fn().mockResolvedValue([{ name: "t1", originalName: "t1", serverName: "s1", description: "" }]),
		resolveDirectTools: vi.fn().mockReturnValue([]), registerDirectTools: vi.fn(),
		buildResourceTools: vi.fn().mockReturnValue([]), deduplicateTools: vi.fn().mockImplementation((tools) => tools),
		startIdleTimer: vi.fn(), startKeepalive: vi.fn(), setConfig: vi.fn(), setConnection: vi.fn(), setMetadata: vi.fn(),
		getAllMetadata: vi.fn().mockReturnValue(new Map()), incrementGeneration: vi.fn().mockReturnValue(1),
		getGeneration: vi.fn().mockReturnValue(1), updateFooter: vi.fn(), ...overrides,
	};
}

export async function run(deps: InitDeps) {
	return onSessionStart(mockPi(), deps)(undefined, undefined);
}
