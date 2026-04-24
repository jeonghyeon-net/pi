export type HeaderTheme = {
	fg(color: string, text: string): string;
	bg(color: string, text: string): string;
	bold(text: string): string;
};

export type HeaderContext = {
	cwd: string;
	model?: { provider: string; id: string };
	sessionManager: { getEntries(): unknown[] };
};
