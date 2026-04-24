import { truncateToWidth, visibleWidth } from "@mariozechner/pi-tui";
import type { HeaderTheme } from "./header-types.js";

export function renderTopBorder(theme: HeaderTheme, width: number, title: string) {
	if (width <= 1) return theme.fg("borderAccent", "╭");
	if (width <= 4) return theme.fg("borderAccent", truncateToWidth("╭──╮", width, ""));
	const prefix = "╭── ";
	const suffix = "╮";
	const titleWidth = Math.max(0, width - visibleWidth(prefix) - visibleWidth(suffix) - 1);
	const clipped = truncateToWidth(title, titleWidth, "");
	const fillWidth = Math.max(0, width - visibleWidth(prefix) - visibleWidth(clipped) - visibleWidth(suffix) - 1);
	return `${theme.fg("borderAccent", prefix)}${theme.bold(theme.fg("accent", clipped))}${theme.fg("borderAccent", ` ${"─".repeat(fillWidth)}${suffix}`)}`;
}

export function renderBottomBorder(theme: HeaderTheme, width: number) {
	if (width <= 1) return theme.fg("borderAccent", "╯");
	return theme.fg("borderAccent", `╰${"─".repeat(Math.max(0, width - 2))}╯`);
}

export function renderFrameLine(theme: HeaderTheme, width: number, content: string) {
	if (width <= 1) return theme.fg("borderAccent", "│");
	if (width <= 3) return theme.fg("borderAccent", truncateToWidth("│ │", width, ""));
	const innerWidth = Math.max(0, width - 4);
	return `${theme.fg("borderAccent", "│")} ${fitText(content, innerWidth, "")} ${theme.fg("borderAccent", "│")}`;
}

export function fitText(text: string, width: number, ellipsis = "…") {
	if (width <= 0) return "";
	const clipped = truncateToWidth(text, width, ellipsis);
	return clipped + " ".repeat(Math.max(0, width - visibleWidth(clipped)));
}
