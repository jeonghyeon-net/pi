import { vi } from "vitest";
import type { ExecFn, FooterContext, FooterTheme, FooterStatusData, ThemeColor, ThemeBg } from "../src/types.js";

export function mockTheme(): FooterTheme {
	return {
		fg: (_color: ThemeColor, text: string) => text,
		bg: (_color: ThemeBg, text: string) => text,
		bold: (text: string) => text,
	};
}

export function mockFooterData(overrides: Partial<FooterStatusData> = {}): FooterStatusData {
	return {
		getExtensionStatuses: () => new Map(),
		getGitBranch: () => "main",
		onBranchChange: () => () => {},
		...overrides,
	};
}

export function mockCtx(overrides: Partial<FooterContext> = {}): FooterContext {
	return {
		hasUI: true,
		model: { id: "claude-opus-4-6" },
		getContextUsage: () => ({ percent: 50 }),
		sessionManager: {
			getCwd: () => "/home/user/project",
			getSessionName: () => undefined,
		},
		ui: { setFooter: vi.fn() },
		...overrides,
	};
}

export function mockExec(result = { stdout: "", code: 0 }): ExecFn {
	return vi.fn().mockResolvedValue(result);
}
