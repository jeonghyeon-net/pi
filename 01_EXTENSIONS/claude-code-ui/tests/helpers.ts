import type { ToolRenderContext, Theme } from "@mariozechner/pi-coding-agent";
import { Container } from "@mariozechner/pi-tui";

export const theme = {
	fg: (token: string, text: string) => `<${token}>${text}</${token}>`,
	bg: (token: string, text: string) => `<bg:${token}>${text}</bg:${token}>`,
	bold: (text: string) => `*${text}*`,
} as Theme;

export function render(component: { render(width: number): string[] }, width = 120) {
	return component.render(width).join("\n");
}

export function toolContext<TArgs, TState extends object>(args: TArgs, state: TState, expanded = false, lastComponent?: ToolRenderContext<TState, TArgs>["lastComponent"]): ToolRenderContext<TState, TArgs> {
	return {
		args,
		toolCallId: "call-1",
		invalidate: () => {},
		lastComponent,
		state,
		cwd: process.cwd(),
		executionStarted: true,
		argsComplete: true,
		isPartial: false,
		expanded,
		showImages: false,
		isError: false,
	};
}

export function emptyComponent() {
	return new Container();
}
