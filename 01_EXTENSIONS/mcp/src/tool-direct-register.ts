import type { DirectToolSpec, ToolDef, ToolExecuteFn, ToolResult } from "./types-tool.js";
import type { ServerConnection } from "./types-server.js";
import { transformContent } from "./content-transform.js";

type GetConnFn = (name: string) => ServerConnection | undefined;
type ConsentFn = (server: string) => Promise<boolean>;

function transformContents(
	contents: Array<{ uri: string; text?: string; blob?: string; mimeType?: string }>,
): ToolResult {
	const blocks = contents.map((c) =>
		transformContent({
			type: "resource",
			resource: { uri: c.uri, text: c.text, blob: c.blob },
		}),
	);
	return { content: blocks };
}

export function createExecutor(
	spec: DirectToolSpec,
	getConn: GetConnFn,
	consent: ConsentFn,
): ToolExecuteFn {
	return async (_callId, params, _signal, _onUpdate, _ctx) => {
		const conn = getConn(spec.serverName);
		if (!conn) throw new Error(`Server "${spec.serverName}" not connected`);
		const allowed = await consent(spec.serverName);
		if (!allowed) throw new Error(`Tool execution denied: consent required`);
		if (spec.resourceUri) {
			const res = await conn.client.readResource({ uri: spec.resourceUri });
			return transformContents(res.contents);
		}
		const res = await conn.client.callTool({
			name: spec.originalName,
			arguments: params,
		});
		return {
			content: res.content.map((c) => transformContent(c)),
		};
	};
}

export function createDirectToolDef(
	spec: DirectToolSpec,
	executor: ToolExecuteFn,
): ToolDef {
	return {
		name: spec.prefixedName,
		label: spec.prefixedName,
		description: spec.description,
		parameters: spec.inputSchema ?? { type: "object", properties: {} },
		execute: executor,
	};
}
