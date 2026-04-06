import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";
import TurndownService from "turndown";

const turndown = new TurndownService({ headingStyle: "atx", codeBlockStyle: "fenced" });

export interface ReadableResult {
	title: string;
	content: string;
}

export function htmlToMarkdown(html: string): ReadableResult | null {
	if (!html.trim()) return null;
	const { document } = parseHTML(html);
	const reader = new Readability(document);
	const article = reader.parse();
	if (!article) return null;
	const markdown = turndown.turndown(article.content);
	return { title: article.title || "", content: markdown };
}
