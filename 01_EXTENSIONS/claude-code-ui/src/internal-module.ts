import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export function resolveFromModule(mainHref: string, relativePath: string) {
	return pathToFileURL(join(dirname(fileURLToPath(mainHref)), relativePath)).href;
}
