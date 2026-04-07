import { Type } from "@sinclair/typebox";
import type { ProxyParams, ProxyToolResult } from "./types-proxy.js";

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
	args: Type.Optional(Type.String({ description: 'Tool arguments as JSON string, e.g. {"jql":"project = COM"}' })),
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
			const parsed = parseArgs(params.args);
			return deps.call(params.tool, parsed);
		}
	}
}

const FALLBACK_DESC = [
	"MCP proxy: call external tools on MCP servers.",
	"Examples:",
	'  status: {action:"status"}',
	'  list tools: {action:"list", server:"myserver"}',
	'  call tool: {action:"call", tool:"jira_search", args:\'{"jql":"project=X"}\'}',
	'  search: {action:"search", query:"jira"}',
	'  describe: {action:"describe", tool:"jira_search"}',
	'  connect: {action:"connect", server:"myserver"}',
].join("\n");
const noServers = (): ProxyToolResult => ({ content: [{ type: "text", text: "No servers." }] });
const noServersAsync = (): Promise<ProxyToolResult> => Promise.resolve(noServers());
const EMPTY_DEPS: ActionDeps = {
	search: noServers, list: noServers, describe: noServers, status: noServers,
	call: noServersAsync, connect: noServersAsync,
};

export function createProxyTool(
	_pi: ProxyPi,
	buildDesc?: () => string,
	makeDeps?: () => ActionDeps,
) {
	return {
		name: "mcp",
		label: "MCP",
		promptSnippet: "MCP gateway - call tools on external MCP servers",
		description: FALLBACK_DESC,
		promptGuidelines: [
			'Use action:"status" first to see available servers.',
			'Use action:"list" with server name to see tools.',
			'Use action:"call" with tool name and args (JSON string) to execute.',
		],
		parameters: ProxySchema,
		execute: async (_toolCallId: string, params: ProxyParams) => {
			const result = await routeAction(params, makeDeps ? makeDeps() : EMPTY_DEPS);
			const desc = buildDesc ? buildDesc() : undefined;
			return { ...result, details: { ...result.details, ...(desc ? { description: desc } : {}) } };
		},
	};
}

function parseArgs(args: string | Record<string, unknown> | undefined): Record<string, unknown> | undefined {
	if (!args) return undefined;
	if (typeof args === "object") return args;
	try { return JSON.parse(args) as Record<string, unknown>; } catch { return undefined; }
}

function text(msg: string): ProxyToolResult {
	return { content: [{ type: "text", text: msg }] };
}
