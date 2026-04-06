import type { AgentConfig } from "./types.js";
export declare function parseFrontmatter(raw: string): {
    data: Record<string, string>;
    content: string;
};
export declare function loadAgentFromString(raw: string, filePath: string): AgentConfig;
export declare function loadAgentsFromDir(dir: string, readDir: (d: string) => string[], readFile: (p: string, enc: string) => string): AgentConfig[];
export declare function getAgent(name: string, agents: Pick<AgentConfig, "name">[]): typeof agents[number] | undefined;
