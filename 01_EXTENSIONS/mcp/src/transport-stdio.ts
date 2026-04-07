import type { McpTransport } from "./types-server.js";
import type { ServerEntry } from "./types-config.js";
import { interpolateEnv } from "./env.js";

export interface StdioOpts {
	env?: Record<string, string>;
	cwd?: string;
}

export type StdioTransportFactory = (
	cmd: string,
	args: string[],
	opts: StdioOpts,
) => McpTransport;

function interpolateRecord(
	rec: Record<string, string> | undefined,
	vars: Record<string, string | undefined>,
): Record<string, string> | undefined {
	if (!rec) return undefined;
	const out: Record<string, string> = {};
	for (const [k, v] of Object.entries(rec)) {
		out[k] = interpolateEnv(v, vars);
	}
	return out;
}

export function createStdioTransport(
	entry: ServerEntry,
	processEnv: Record<string, string | undefined>,
	factory: StdioTransportFactory,
): McpTransport {
	const args = (entry.args ?? []).map((a) => interpolateEnv(a, processEnv));
	const env = interpolateRecord(entry.env, processEnv);
	const opts: StdioOpts = { env };
	if (entry.cwd) opts.cwd = entry.cwd;
	return factory(entry.command ?? "", args, opts);
}
