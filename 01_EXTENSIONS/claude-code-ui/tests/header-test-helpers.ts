import type { HeaderContext, HeaderTheme } from "../src/header-types.ts";

export const theme: HeaderTheme = {
	fg: (_color, text) => text,
	bg: (_color, text) => text,
	bold: (text) => text,
};

export function makeContext(overrides: Partial<HeaderContext> = {}): HeaderContext {
	return {
		cwd: "/tmp/demo",
		model: { provider: "anthropic", id: "claude-haiku-4-5" },
		sessionManager: { getEntries: () => [] },
		...overrides,
	};
}
