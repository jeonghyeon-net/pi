import { Type } from "@sinclair/typebox";
import type { ProxyParams, ProxyToolResult } from "./types-proxy.js";
import type { ToolDef } from "./types-tool.js";

export interface ProxyPi {
	sendMessage(msg: { customType: string; content: string; display: boolean }): void;
}

export interface ActionDeps {
	search: (query: string | undefined) => ProxyToolResult;
	list: (server: string | undefined) => ProxyToolResult;
	describe: (tool: string | undefined) => ProxyToolResult;
	status: () => ProxyToolResult;
	call: (tool: string, args?: Record<string, unknown>) => Promise<ProxyToolResult>;
	connect: (server: string | undefined) => Promise<ProxyToolResult>;
}

const ProxySchema = Type.Object({
	action: Type.Union([
		Type.Literal("call"), Type.Literal("list"), Type.Literal("describe"),
		Type.Literal("search"), Type.Literal("status"), Type.Literal("connect"),
	]),
	tool: Type.Optional(Type.String({ description: "Tool name (for call/describe)" })),
	args: Type.Optional(Type.Record(Type.String(), Type.Unknown(), { description: "Tool arguments (for call)" })),
	server: Type.Optional(Type.String({ description: "Target server (for list/connect/call)" })),
	query: Type.Optional(Type.String({ description: "Search query (for search)" })),
});

export function routeAction(params: ProxyParams, deps: ActionDeps): Promise<ProxyToolResult> {
	switch (params.action) {
		case "search": return Promise.resolve(deps.search(params.query));
		case "list": return Promise.resolve(deps.list(params.server));
		case "describe": return Promise.resolve(deps.describe(params.tool));
		case "status": return Promise.resolve(deps.status());
		case "connect": return deps.connect(params.server);
		case "call": {
			if (!params.tool) {
				return Promise.resolve(text("Tool name is required for call action."));
			}
			return deps.call(params.tool, params.args);
		}
	}
}

export function createProxyTool(
	_pi: ProxyPi,
	buildDesc: () => string,
	makeDeps: () => ActionDeps,
): ToolDef {
	return {
		name: "mcp",
		label: "MCP",
		description: buildDesc(),
		parameters: ProxySchema,
		execute: async (_toolCallId, params) => {
			const p = params as ProxyParams;
			return routeAction(p, makeDeps());
		},
	};
}

function text(msg: string): ProxyToolResult {
	return { content: [{ type: "text", text: msg }] };
}
