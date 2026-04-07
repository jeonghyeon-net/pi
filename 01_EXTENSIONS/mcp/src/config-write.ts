import type { McpConfig } from "./types-config.js";

export interface WriteFsOps {
	writeFile(path: string, data: string): void;
	rename(from: string, to: string): void;
	unlink(path: string): void;
	getPid(): number;
}

function tempPath(target: string, pid: number): string {
	return `${target}.${pid}.tmp`;
}

export function writeConfigAtomic(
	path: string,
	config: McpConfig,
	fs: WriteFsOps,
): void {
	const tmp = tempPath(path, fs.getPid());
	const data = JSON.stringify(config, null, 2) + "\n";
	fs.writeFile(tmp, data);
	try {
		fs.rename(tmp, path);
	} catch (err) {
		try { fs.unlink(tmp); } catch { /* best-effort cleanup */ }
		throw err;
	}
}
