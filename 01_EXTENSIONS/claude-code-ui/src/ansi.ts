const ANSI_RESET_BG = "\x1b[49m";
const ANSI_RESET_FG = "\x1b[39m";
const ANSI_RE = /\x1b\[[0-9;]*m/g;
const OSC_RE = /\x1b\][\s\S]*?(?:\u0007|\x1b\\)/g;

export function colorizeBgRgb(text: string, rgb: [number, number, number]) {
	const [r, g, b] = rgb;
	return `\x1b[48;2;${r};${g};${b}m${text}${ANSI_RESET_BG}`;
}

export function colorizeRgb(text: string, rgb: [number, number, number]) {
	const [r, g, b] = rgb;
	return `\x1b[38;2;${r};${g};${b}m${text}${ANSI_RESET_FG}`;
}

export function stripAnsi(text: string) {
	return text.replace(OSC_RE, "").replace(ANSI_RE, "");
}
