import type { McpContent } from "./types-server.js";

interface ContentBlock {
	type: string;
	text?: string;
	data?: string;
	mimeType?: string;
}

export function transformContent(content: McpContent): ContentBlock {
	switch (content.type) {
		case "text":
			return { type: "text", text: content.text ?? "" };
		case "image":
			return { type: "image", data: content.data, mimeType: content.mimeType };
		case "resource":
			return {
				type: "text",
				text: `[Resource: ${content.resource?.uri}]\n${content.resource?.text ?? content.resource?.blob ?? ""}`,
			};
		case "resource_link":
			return { type: "text", text: `[Resource Link: ${content.name ?? ""} (${content.uri ?? ""})]` };
		case "audio":
			return { type: "text", text: "[Audio content not supported in text mode]" };
		default:
			return { type: "text", text: JSON.stringify(content) };
	}
}
