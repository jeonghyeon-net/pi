const ENV_RE = /\$\{([^}]+)\}/g;

export function interpolateEnv(
	text: string,
	vars: Record<string, string | undefined>,
): string {
	return text.replace(ENV_RE, (match, name: string) => {
		const val = vars[name];
		return val !== undefined ? val : match;
	});
}
