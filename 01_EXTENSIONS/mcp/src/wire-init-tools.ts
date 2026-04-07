import { resolveDirectTools } from "./tool-direct.js";
import { createExecutor, createDirectToolDef } from "./tool-direct-register.js";
import { buildResourceToolSpecs } from "./tool-resource.js";
import { buildToolMetadata } from "./tool-metadata.js";
import type { McpConfig, ToolPrefix } from "./types-config.js";
import type { ToolMetadata, DirectToolSpec } from "./types-tool.js";
import type { McpClient } from "./types-server.js";
import type { InitDeps } from "./lifecycle-init.js";
import { getConnections } from "./state.js";

interface InitPi {
	registerTool(tool: { name: string; parameters: Record<string, unknown>; execute: Function }): void;
}

export function wireBuildMetadata(): (name: string, client: unknown) => Promise<ToolMetadata[]> {
	return async (name, client) => buildToolMetadata(client as McpClient, name);
}

export function wireResolveDirectTools(): (metadata: Map<string, ToolMetadata[]>, config: McpConfig) => DirectToolSpec[] {
	return (metadata, config) => {
		const registered = new Set<string>();
		const prefix: ToolPrefix = config.settings?.toolPrefix ?? "server";
		const allSpecs: DirectToolSpec[] = [];
		for (const [server, tools] of metadata) {
			const entry = config.mcpServers[server];
			const dt = entry?.directTools ?? config.settings?.directTools ?? false;
			if (dt === false) continue;
			const specs = resolveDirectTools(tools, dt, prefix, registered, () => {});
			allSpecs.push(...specs);
		}
		return allSpecs;
	};
}

export function wireRegisterDirectTools(): (pi: InitPi, specs: DirectToolSpec[], deps: InitDeps) => void {
	return (pi, specs) => {
		const getConn = (name: string) => getConnections().get(name);
		const consent = async () => true;
		for (const spec of specs) {
			const executor = createExecutor(spec, getConn, consent);
			const schema = spec.inputSchema ?? { type: "object", properties: {} };
			pi.registerTool({ name: spec.prefixedName, parameters: schema, execute: executor });
		}
	};
}

export function wireBuildResourceTools(): (name: string, client: unknown) => ToolMetadata[] {
	return () => [];
}

export function wireDeduplicateTools(): (tools: DirectToolSpec[]) => DirectToolSpec[] {
	return (tools) => {
		const seen = new Set<string>();
		return tools.filter((t) => {
			if (seen.has(t.prefixedName)) return false;
			seen.add(t.prefixedName);
			return true;
		});
	};
}
