import type { ExtensionCommandContext, ExtensionContext } from "@mariozechner/pi-coding-agent";

export type ReviewCommandApi = {
	exec: (command: string, args: string[], options?: { cwd?: string }) => Promise<{ code: number; stdout: string; stderr: string }>;
	registerCommand: (name: string, spec: { description: string; handler: (args: string, ctx: ExtensionCommandContext) => Promise<void> }) => void;
	on: (name: "session_shutdown", handler: (event: object, ctx: ExtensionContext) => void | Promise<void>) => void;
};
