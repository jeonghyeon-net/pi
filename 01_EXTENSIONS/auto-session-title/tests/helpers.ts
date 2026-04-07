import { vi } from "vitest";
import type { SessionTitleContext, SessionTitleInput, SessionTitleRuntime } from "../src/handlers.js";

export type StubRuntime = SessionTitleRuntime & {
	getSessionName: ReturnType<typeof vi.fn>;
	setSessionName: ReturnType<typeof vi.fn>;
};

export type StubContext = SessionTitleContext & {
	ui: { setTitle: ReturnType<typeof vi.fn> };
};

export function stubRuntime(currentName?: string): StubRuntime {
	return {
		getSessionName: vi.fn(() => currentName),
		setSessionName: vi.fn(),
	};
}

export function stubContext(overrides: Partial<StubContext> = {}): StubContext {
	return {
		hasUI: true,
		cwd: "/Users/me/Desktop/pi",
		model: undefined,
		modelRegistry: { getApiKeyAndHeaders: vi.fn(async () => ({ ok: false, error: "no auth" })) },
		ui: { setTitle: vi.fn() },
		sessionManager: {
			getSessionName: () => undefined,
			getEntries: () => [],
			getCwd: () => "/Users/me/Desktop/pi",
		},
		...overrides,
	};
}

export function makeInput(
	text: string,
	source: SessionTitleInput["source"] = "interactive",
): SessionTitleInput {
	return { text, source };
}
