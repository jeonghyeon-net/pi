import { proxySearch } from "./proxy-search.js";
import { proxyList, proxyDescribe, proxyStatus } from "./proxy-query.js";
import { proxyCall } from "./proxy-call.js";
import type { ActionDeps } from "./proxy-router.js";
import { matchTool } from "./search.js";
import { formatSchema } from "./schema-format.js";
import { getAllMetadata, getMetadata } from "./state.js";
import { wireCommandConnect } from "./wire-command.js";
import { buildDescription } from "./proxy-description.js";
import { buildCallDeps, buildServerStatuses, connectAction, findToolInMetadata } from "./wire-proxy-helpers.js";

export { buildCallDeps, buildServerStatuses, findToolInMetadata } from "./wire-proxy-helpers.js";

export function wireProxyDeps(): ActionDeps {
	const doConnect = wireCommandConnect();
	const callDeps = buildCallDeps(doConnect);
	return {
		search: (query) => proxySearch(query ?? "", getAllMetadata(), matchTool),
		list: (server) => proxyList(server, (s) => getMetadata(s)),
		describe: (tool) => proxyDescribe(tool, findToolInMetadata, formatSchema),
		status: () => proxyStatus(buildServerStatuses()),
		call: (tool, args) => proxyCall(tool, args, callDeps),
		connect: async (server) => connectAction(server, doConnect),
	};
}

export function buildProxyDescription(): string {
	return buildDescription({ getServers: () => buildServerStatuses(), getMetadataMap: () => getAllMetadata() });
}
