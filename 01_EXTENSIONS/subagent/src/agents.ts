import type { AgentConfig } from "./types.js";

export function parseFrontmatter(raw: string): { data: Record<string, string>; content: string } {
	const match = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
	if (!match) return { data: {}, content: raw };
	const data: Record<string, string> = {};
	for (const line of match[1].split("\n")) {
		const idx = line.indexOf(":");
		if (idx > 0) data[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
	}
	return { data, content: match[2].trim() };
}

export function loadAgentFromString(raw: string, filePath: string): AgentConfig {
	const { data, content } = parseFrontmatter(raw);
	return {
		name: data.name ?? "",
		description: data.description ?? "",
		model: data.model || undefined,
		thinking: data.thinking || undefined,
		tools: data.tools ? data.tools.split(/,\s*/) : undefined,
		systemPrompt: content,
		filePath,
	};
}

export function loadAgentsFromDir(
	dir: string,
	readDir: (d: string) => string[],
	readFile: (p: string, enc: string) => string,
): AgentConfig[] {
	return readDir(dir)
		.filter((f: string) => f.endsWith(".md"))
		.map((f: string) => loadAgentFromString(readFile(`${dir}/${f}`, "utf-8"), `${dir}/${f}`));
}

export function getAgent(name: string, agents: Pick<AgentConfig, "name">[]): typeof agents[number] | undefined {
	return agents.find((a) => a.name === name);
}
