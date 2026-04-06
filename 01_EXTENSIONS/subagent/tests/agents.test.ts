import { describe, it, expect } from "vitest";
import { parseFrontmatter, loadAgentFromString, getAgent, loadAgentsFromDir } from "../src/agents.js";

describe("parseFrontmatter", () => {
	it("parses yaml frontmatter and body", () => {
		const raw = "---\nname: scout\nmodel: gpt-5.4-mini\n---\nYou are a scout.";
		const { data, content } = parseFrontmatter(raw);
		expect(data.name).toBe("scout");
		expect(data.model).toBe("gpt-5.4-mini");
		expect(content).toBe("You are a scout.");
	});

	it("returns empty data when no frontmatter", () => {
		const { data, content } = parseFrontmatter("Just text");
		expect(data).toEqual({});
		expect(content).toBe("Just text");
	});

	it("handles tools as comma-separated list", () => {
		const raw = "---\ntools: read, grep, find\n---\nPrompt";
		const agent = loadAgentFromString(raw, "/fake/scout.md");
		expect(agent.tools).toEqual(["read", "grep", "find"]);
	});
});

describe("loadAgentFromString", () => {
	it("builds AgentConfig from raw markdown", () => {
		const raw = "---\nname: worker\ndescription: General worker\nmodel: gpt-5.4\nthinking: medium\n---\nDo work.";
		const agent = loadAgentFromString(raw, "/path/worker.md");
		expect(agent.name).toBe("worker");
		expect(agent.description).toBe("General worker");
		expect(agent.model).toBe("gpt-5.4");
		expect(agent.thinking).toBe("medium");
		expect(agent.systemPrompt).toBe("Do work.");
		expect(agent.filePath).toBe("/path/worker.md");
	});

	it("handles missing optional fields", () => {
		const raw = "---\nname: minimal\n---\nPrompt";
		const agent = loadAgentFromString(raw, "/path/minimal.md");
		expect(agent.model).toBeUndefined();
		expect(agent.thinking).toBeUndefined();
		expect(agent.tools).toBeUndefined();
	});
});

describe("loadAgentsFromDir", () => {
	it("loads .md files from directory", () => {
		const readDir = () => ["scout.md", "worker.md", "readme.txt"];
		const readFile = (p: string) => `---\nname: ${p.includes("scout") ? "scout" : "worker"}\n---\nPrompt`;
		const agents = loadAgentsFromDir("/agents", readDir, readFile);
		expect(agents).toHaveLength(2);
		expect(agents[0].name).toBe("scout");
	});
});

describe("getAgent", () => {
	const agents = [
		{ name: "scout", description: "", systemPrompt: "", filePath: "" },
		{ name: "worker", description: "", systemPrompt: "", filePath: "" },
	];

	it("finds agent by name", () => {
		expect(getAgent("scout", agents)?.name).toBe("scout");
	});

	it("returns undefined for missing agent", () => {
		expect(getAgent("unknown", agents)).toBeUndefined();
	});
});
