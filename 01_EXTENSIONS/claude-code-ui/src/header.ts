import { VERSION } from "@mariozechner/pi-coding-agent";
import { visibleWidth } from "@mariozechner/pi-tui";
import { buildLeftColumn, buildRightColumn } from "./header-content.js";
import { fitText, renderBottomBorder, renderFrameLine, renderTopBorder } from "./header-frame.js";
import type { HeaderContext, HeaderTheme } from "./header-types.js";
import { createHeaderSnapshot } from "./header-utils.js";
export { getProjectName } from "./header-utils.js";

const MIN_TWO_COLUMN_WIDTH = 96;

export function createPiWelcomeHeader(ctx: HeaderContext) {
	const snapshot = createHeaderSnapshot(ctx);
	return (_tui: unknown, theme: HeaderTheme) => ({
		invalidate() {},
		render(width: number) {
			const safeWidth = Math.max(1, width);
			const innerWidth = Math.max(1, safeWidth - 4);
			const leftLines = buildLeftColumn(snapshot, theme);
			const rightLines = buildRightColumn(snapshot, theme);
			const lines = [renderTopBorder(theme, safeWidth, `Pi v${VERSION}`), renderFrameLine(theme, safeWidth, "")];
			const wide = safeWidth >= MIN_TWO_COLUMN_WIDTH;
			for (const row of wide ? renderWideRows(theme, innerWidth, leftLines, rightLines) : renderStackedRows(theme, leftLines, rightLines)) {
				lines.push(renderFrameLine(theme, safeWidth, row));
			}
			lines.push(renderFrameLine(theme, safeWidth, ""));
			lines.push(renderBottomBorder(theme, safeWidth));
			return lines;
		},
	});
}

function renderWideRows(theme: HeaderTheme, innerWidth: number, leftLines: string[], rightLines: string[]) {
	const divider = ` ${theme.fg("borderMuted", "│")} `;
	const minRightWidth = 36;
	const maxLeftWidth = Math.max(24, innerWidth - visibleWidth(divider) - minRightWidth);
	const desiredLeftWidth = Math.max(24, ...leftLines.map((line) => visibleWidth(line)));
	const leftWidth = Math.min(maxLeftWidth, desiredLeftWidth);
	const rightWidth = Math.max(24, innerWidth - visibleWidth(divider) - leftWidth);
	const totalRows = Math.max(leftLines.length, rightLines.length);
	const paddedLeft = padLines(leftLines, totalRows);
	const paddedRight = padLines(rightLines, totalRows);
	return paddedLeft.map((line, index) => `${fitText(line, leftWidth)}${divider}${fitText(paddedRight[index]!, rightWidth)}`);
}

function padLines(lines: string[], totalRows: number) {
	return [...lines, ...Array.from({ length: Math.max(0, totalRows - lines.length) }, () => "")];
}

function renderStackedRows(theme: HeaderTheme, leftLines: string[], rightLines: string[]) {
	return [...leftLines, "", theme.bold(theme.fg("accent", "Tips for getting started")), ...rightLines.slice(1)];
}
