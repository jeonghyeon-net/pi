import type { Component, OverlayOptions } from "@mariozechner/pi-tui";
import { truncateToWidth, visibleWidth, wrapTextWithAnsi } from "@mariozechner/pi-tui";
import { OVERVIEW_OVERLAY_WIDTH } from "./overview-constants.js";
import { buildOverviewBodyLines, resolveOverviewTitle } from "./overview-entry.js";
import type { OverlayTheme, OverlayTui, SessionOverview } from "./overview-types.js";

export class OverviewOverlayComponent implements Component {
	private cachedWidth?: number;
	private cachedLines?: string[];

	constructor(private tui: OverlayTui, private theme: OverlayTheme, private overview?: SessionOverview, private fallbackTitle?: string) {}

	setContent(overview?: SessionOverview, fallbackTitle?: string): void {
		this.overview = overview;
		this.fallbackTitle = fallbackTitle;
		this.invalidate();
		this.tui.requestRender();
	}

	render(width: number): string[] {
		if (this.cachedLines && this.cachedWidth === width) return this.cachedLines;
		const innerWidth = Math.max(1, width - 2);
		const border = (text: string) => this.theme.fg("border", text);
		const pad = (text: string) => text + " ".repeat(Math.max(0, innerWidth - visibleWidth(text)));
		const title = truncateToWidth(` ${resolveOverviewTitle(this.overview, this.fallbackTitle)} `, Math.max(1, innerWidth - 2), "...", false);
		const header = this.theme.fg("accent", title);
		const right = "─".repeat(Math.max(1, innerWidth - 1 - visibleWidth(title)));
		const body = buildOverviewBodyLines(this.overview).flatMap((line) => wrapTextWithAnsi(line, innerWidth));
		this.cachedLines = [
			border("╭─") + header + border(`${right}╮`),
			...body.map((line) => border("│") + pad(line) + border("│")),
			border(`╰${"─".repeat(innerWidth)}╯`),
		];
		this.cachedWidth = width;
		return this.cachedLines;
	}

	invalidate(): void {
		this.cachedWidth = undefined;
		this.cachedLines = undefined;
	}
}

export function getOverviewOverlayOptions(): OverlayOptions {
	return {
		anchor: "top-right",
		width: OVERVIEW_OVERLAY_WIDTH,
		minWidth: 48,
		margin: { top: 1, right: 1 },
		nonCapturing: true,
		visible: (termWidth: number) => termWidth >= 100,
	};
}
