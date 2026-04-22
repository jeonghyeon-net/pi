import type { HeaderTheme } from "./header-types.js";

export function getPiMascot(theme: HeaderTheme) {
	const blue = (text: string) => theme.fg("accent", text);
	const white = (text: string) => theme.fg("text", text);
	const dark = (text: string) => theme.fg("dim", text);
	const eye = `${white("█")}${dark("▌")}`;
	const bar = blue("██████████████");
	const legs = blue("██") + "    " + blue("██");
	return [
		"",
		`     ${eye}  ${eye}`,
		`  ${bar}`,
		`     ${legs}`,
		`     ${legs}`,
		`     ${legs}`,
		"",
	];
}
