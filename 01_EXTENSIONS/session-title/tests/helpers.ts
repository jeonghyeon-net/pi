import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { vi } from "vitest";

export type Handler = (event: any, ctx: ExtensionContext) => void | Promise<void>;

export function createApiMock(initialName = "") {
	const handlers = new Map<string, Handler[]>();
	let sessionName = initialName;
	const api = {
		on(eventName: string, handler: Handler) {
			handlers.set(eventName, [...(handlers.get(eventName) ?? []), handler]);
		},
		getSessionName() {
			return sessionName;
		},
		setSessionName(nextName: string) {
			sessionName = nextName;
		},
	} as ExtensionAPI;
	return {
		api,
		getHandler(eventName: string) {
			return handlers.get(eventName)?.[0];
		},
		getSessionName() {
			return sessionName;
		},
		setSessionName(nextName: string) {
			sessionName = nextName;
		},
	};
}

export function createContext(options: {
	hasUI?: boolean;
	cwd?: string;
	sessionFile?: string;
	sessionName?: string;
	throwOnGetSessionName?: boolean;
	branchEntries?: object[];
	entries?: object[];
}) {
	const setStatus = vi.fn();
	const setTitle = vi.fn();
	const ctx = {
		hasUI: options.hasUI ?? true,
		cwd: options.cwd ?? "/tmp/pi-project",
		ui: { setStatus, setTitle },
		sessionManager: {
			getSessionFile: () => options.sessionFile ?? "/tmp/root/session.jsonl",
			getSessionName: () => {
				if (options.throwOnGetSessionName) throw new Error("boom");
				return options.sessionName ?? "";
			},
			getBranch: () => options.branchEntries ?? options.entries ?? [],
			getEntries: () => options.entries ?? options.branchEntries ?? [],
		},
	} as ExtensionContext;
	return { ctx, setStatus, setTitle };
}
