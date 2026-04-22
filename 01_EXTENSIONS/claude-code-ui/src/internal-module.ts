import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);

export function resolvePackageFile(packageName: string, file: string) {
	for (const base of require.resolve.paths(packageName) ?? []) {
		const candidate = join(base, packageName, file);
		if (existsSync(candidate)) return pathToFileURL(candidate).href;
	}
	throw new Error(`Could not resolve ${packageName}/${file}`);
}
