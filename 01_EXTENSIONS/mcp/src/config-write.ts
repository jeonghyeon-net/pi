import type { McpConfig, ServerProvenance } from "./types-config.js";

export interface WriteFsOps {
	writeFile(path: string, data: string): void;
	readFile(path: string): string;
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

export function resolveWritePath(
	server: string,
	provenance: Record<string, ServerProvenance>,
	fallbackPath: string,
): string {
	const prov = provenance[server];
	if (!prov) return fallbackPath;
	return prov.path || fallbackPath;
}

export function writeServerConfig(
	server: string,
	update: Partial<McpConfig["mcpServers"][string]>,
	provenance: Record<string, ServerProvenance>,
	fallbackPath: string,
	fs: WriteFsOps,
): void {
	const path = resolveWritePath(server, provenance, fallbackPath);
	let existing: McpConfig;
	try {
		existing = JSON.parse(fs.readFile(path));
	} catch {
		existing = { mcpServers: {} };
	}
	existing.mcpServers ??= {};
	existing.mcpServers[server] = { ...existing.mcpServers[server], ...update };
	writeConfigAtomic(path, existing, fs);
}
