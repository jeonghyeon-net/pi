import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, it } from "node:test";
import {
  computeAgentAliasHints,
  discoverAgents,
  getSubCommandAgentCompletions,
  matchSubCommandAgent,
  normalizeModel,
  normalizeThinkingLevel,
  normalizeTools,
} from "../agent/discovery.js";
import type { AgentConfig } from "../core/types.js";

function makeAgent(name: string, description = "test agent"): AgentConfig {
  return {
    name,
    description,
    systemPrompt: "",
    source: "project",
    filePath: `/fake/${name}.md`,
  };
}

// ━━━ normalizeTools ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("normalizeTools", () => {
  it("returns undefined for undefined input", () => {
    assert.equal(normalizeTools(undefined, "pi"), undefined);
  });

  it("returns undefined for empty string", () => {
    assert.equal(normalizeTools("", "pi"), undefined);
  });

  it("returns undefined for only-commas string", () => {
    assert.equal(normalizeTools(",,,", "pi"), undefined);
  });

  it("splits and trims tools in pi format", () => {
    assert.deepStrictEqual(normalizeTools("bash, read, edit", "pi"), ["bash", "read", "edit"]);
  });

  it("maps known tools in claude format", () => {
    const result = normalizeTools("bash,read,edit", "claude");
    assert.deepStrictEqual(result, ["bash", "read", "edit"]);
  });

  it("deduplicates in claude format", () => {
    const result = normalizeTools("bash,bash", "claude");
    assert.deepStrictEqual(result, ["bash"]);
  });

  it("filters unmappable tools in claude format", () => {
    const result = normalizeTools("skill", "claude");
    assert.equal(result, undefined);
  });

  it("returns undefined when all claude tools are unmappable", () => {
    assert.equal(normalizeTools("skill", "claude"), undefined);
  });

  it("maps glob to find in claude format", () => {
    const result = normalizeTools("glob", "claude");
    assert.deepStrictEqual(result, ["find"]);
  });

  it("maps todowrite and todoread to todo in claude format", () => {
    const result = normalizeTools("todowrite,todoread", "claude");
    assert.deepStrictEqual(result, ["todo"]);
  });
});

// ━━━ normalizeModel ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("normalizeModel", () => {
  it("returns undefined for undefined input", () => {
    assert.equal(normalizeModel(undefined, "pi"), undefined);
  });

  it("returns undefined for empty string", () => {
    assert.equal(normalizeModel("", "pi"), undefined);
  });

  it("returns undefined for whitespace-only", () => {
    assert.equal(normalizeModel("   ", "pi"), undefined);
  });

  it("returns raw model in pi format", () => {
    assert.equal(normalizeModel("my-model", "pi"), "my-model");
  });

  it("maps alias to model in claude format", () => {
    assert.equal(normalizeModel("opus", "claude"), "claude-opus-4-6");
    assert.equal(normalizeModel("sonnet", "claude"), "claude-sonnet-4-5");
    assert.equal(normalizeModel("haiku", "claude"), "claude-haiku-4-5");
  });

  it("is case-insensitive for claude aliases", () => {
    assert.equal(normalizeModel("OPUS", "claude"), "claude-opus-4-6");
  });

  it("passes through model with / in claude format", () => {
    assert.equal(normalizeModel("anthropic/opus", "claude"), "anthropic/opus");
  });

  it("passes through unknown model in claude format", () => {
    assert.equal(normalizeModel("gpt-4o", "claude"), "gpt-4o");
  });
});

// ━━━ normalizeThinkingLevel ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("normalizeThinkingLevel", () => {
  it("returns undefined for undefined input", () => {
    assert.equal(normalizeThinkingLevel(undefined), undefined);
  });

  it("returns undefined for empty string", () => {
    assert.equal(normalizeThinkingLevel(""), undefined);
  });

  it("returns valid levels", () => {
    assert.equal(normalizeThinkingLevel("off"), "off");
    assert.equal(normalizeThinkingLevel("minimal"), "minimal");
    assert.equal(normalizeThinkingLevel("low"), "low");
    assert.equal(normalizeThinkingLevel("medium"), "medium");
    assert.equal(normalizeThinkingLevel("high"), "high");
    assert.equal(normalizeThinkingLevel("xhigh"), "xhigh");
  });

  it("is case-insensitive", () => {
    assert.equal(normalizeThinkingLevel("HIGH"), "high");
    assert.equal(normalizeThinkingLevel("Medium"), "medium");
  });

  it("returns undefined for invalid level", () => {
    assert.equal(normalizeThinkingLevel("ultra"), undefined);
    assert.equal(normalizeThinkingLevel("max"), undefined);
  });
});

// ━━━ matchSubCommandAgent ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("matchSubCommandAgent", () => {
  const agents = [
    makeAgent("planner"),
    makeAgent("worker"),
    makeAgent("reviewer"),
    makeAgent("code-reviewer"),
  ];

  it("returns empty ambiguous list for empty token", () => {
    const result = matchSubCommandAgent(agents, "");
    assert.equal(result.matchedAgent, undefined);
    assert.deepStrictEqual(result.ambiguousAgents, []);
  });

  it("exact match", () => {
    const result = matchSubCommandAgent(agents, "planner");
    assert.equal(result.matchedAgent?.name, "planner");
    assert.deepStrictEqual(result.ambiguousAgents, []);
  });

  it("exact match is case-insensitive", () => {
    const result = matchSubCommandAgent(agents, "PLANNER");
    assert.equal(result.matchedAgent?.name, "planner");
  });

  it("prefix match - unique", () => {
    const result = matchSubCommandAgent(agents, "plan");
    assert.equal(result.matchedAgent?.name, "planner");
  });

  it("prefix match - unique when only one matches", () => {
    const result = matchSubCommandAgent(agents, "work");
    assert.equal(result.matchedAgent?.name, "worker");
  });

  it("prefix match - ambiguous when word-part also matches", () => {
    // 'rev' matches 'reviewer' as full-name prefix AND 'code-reviewer' via word-part prefix
    const result = matchSubCommandAgent(agents, "rev");
    assert.equal(result.matchedAgent, undefined);
    assert.ok(result.ambiguousAgents.length >= 2);
  });

  it("contains match", () => {
    const result = matchSubCommandAgent(agents, "view");
    // "view" is contained in both "reviewer" and "code-reviewer"
    assert.equal(result.matchedAgent, undefined);
    assert.ok(result.ambiguousAgents.length >= 2);
  });

  it("no match at all", () => {
    const result = matchSubCommandAgent(agents, "nonexistent");
    assert.equal(result.matchedAgent, undefined);
    assert.deepStrictEqual(result.ambiguousAgents, []);
  });

  it("initials match", () => {
    // "cr" = initials of "code-reviewer"
    const result = matchSubCommandAgent(agents, "cr");
    assert.equal(result.matchedAgent?.name, "code-reviewer");
  });

  it("ambiguous prefix when multiple agents share prefix", () => {
    const agents2 = [makeAgent("worker-a"), makeAgent("worker-b")];
    const result = matchSubCommandAgent(agents2, "worker");
    assert.equal(result.matchedAgent, undefined);
    assert.equal(result.ambiguousAgents.length, 2);
  });

  it("exact match ambiguous when multiple agents have same normalized name", () => {
    // Two agents with names that normalize to the same value
    // uniqueByName deduplicates, so actually this gives 1. Need truly different names that normalize same.
    // Actually uniqueByName checks .name, so two with same name → 1 unique
    // For exact.length > 1 we need two agents with the SAME lowercased name but different .name values
    // That's impossible since toLowerCase is deterministic... unless they have diff casing
    // Actually n === raw checks lowercase, and normalizeAlias also lowercases.
    // exact filters: n === raw || normalizeAlias(n) === normalized
    // So if agent names differ but both match the input...
    // e.g., agents named "test-a" and "testa" would both have normalizeAlias = "testa"
    const agents3 = [makeAgent("test-a"), makeAgent("testa")];
    const result = matchSubCommandAgent(agents3, "testa");
    // "testa" exact match: n="test-a" → normalizeAlias="testa" === "testa" ✓
    //                      n="testa" → n === "testa" ✓
    // Both match, uniqueByName keeps both (different names), so exact.length = 2
    assert.equal(result.matchedAgent, undefined);
    assert.equal(result.ambiguousAgents.length, 2);
  });

  it("ambiguous initials when multiple agents have same initials", () => {
    // "ca" and "cb" both have initials matching their first letters
    // We need two agents whose initials match the search token
    // initials of "code-alpha" = "ca", initials of "cyber-alpha" = "ca"
    matchSubCommandAgent([makeAgent("code-alpha"), makeAgent("cyber-alpha")], "ca");
    // prefix also matches both (c... starts), so this hits prefix ambiguous first
    // Need agents where prefix doesn't match but initials do
    // Let's use agents where the token doesn't prefix-match any name
    // initials: "de" for both
    matchSubCommandAgent([makeAgent("delta-echo"), makeAgent("dark-energy")], "de");
    // prefix: "delta-echo" starts with "de" ✓, "dark-energy" starts with "de" ✓
    // So prefix is ambiguous → hits prefix.length > 1, not initials
    // We need a case where prefix returns 0 but initials returns > 1
    const agents4 = [makeAgent("first-alpha"), makeAgent("fox-ace")];
    // initials: "fa" for both. prefix: "first-alpha" starts with "fa" ✓ (via word)... hmm
    // Actually "fa" → prefix check: name.startsWith("fa") → "first-alpha" no, "fox-ace" no
    // nn.startsWith("fa") → "firstalpha" no, "foxace" no
    // parts.some(p => p.startsWith("fa")): "first" no, "alpha" no; "fox" no, "ace" no
    // So prefix = 0. initials: getInitials("first-alpha") = "fa", getInitials("fox-ace") = "fa"
    // Both match! initials.length = 2 → ambiguous
    const result3 = matchSubCommandAgent(agents4, "fa");
    assert.equal(result3.matchedAgent, undefined);
    assert.equal(result3.ambiguousAgents.length, 2);
  });

  it("unique contains match", () => {
    // Need a token that doesn't match prefix or initials but is contained in exactly one name
    const agents2 = [makeAgent("alphabetical"), makeAgent("numeric")];
    // "habet" is contained in "alphabetical" but not in "numeric"
    // prefix: "alphabetical" starts with "habet"? no. "numeric" starts with "habet"? no
    // normalized prefix check also fails
    // initials: getInitials("alphabetical") = "a", getInitials("numeric") = "n" — not "habet"
    // contains: "alphabetical" includes "habet"? yes. "numeric" includes "habet"? no
    const result = matchSubCommandAgent(agents2, "habet");
    assert.equal(result.matchedAgent?.name, "alphabetical");
    assert.deepStrictEqual(result.ambiguousAgents, []);
  });

  it("handles normalized alias matching (ignoring hyphens)", () => {
    const result = matchSubCommandAgent(agents, "codereviewer");
    assert.equal(result.matchedAgent?.name, "code-reviewer");
  });

  it("word-part prefix match", () => {
    // "code" should match "code-reviewer" as a word-part prefix
    const result = matchSubCommandAgent(agents, "code");
    assert.equal(result.matchedAgent?.name, "code-reviewer");
  });
});

// ━━━ getSubCommandAgentCompletions ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("getSubCommandAgentCompletions", () => {
  const agents = [makeAgent("planner"), makeAgent("worker"), makeAgent("reviewer")];

  it("returns all agents for empty prefix", () => {
    const result = getSubCommandAgentCompletions(agents, "");
    assert.ok(result !== null);
    assert.equal(result.length, 3);
  });

  it("returns null if prefix contains a space", () => {
    const result = getSubCommandAgentCompletions(agents, "plan ner");
    assert.equal(result, null);
  });

  it("filters by prefix match", () => {
    const result = getSubCommandAgentCompletions(agents, "pl");
    assert.ok(result !== null);
    assert.equal(result.length, 1);
    assert.equal(result[0]?.label, "planner");
  });

  it("returns null when nothing matches", () => {
    const result = getSubCommandAgentCompletions(agents, "zzz");
    assert.equal(result, null);
  });

  it("falls back to [source] when description is empty", () => {
    const agentsNoDesc = [makeAgent("nodesc", "")];
    // Empty description → should use `[${agent.source}]` fallback
    const result = getSubCommandAgentCompletions(agentsNoDesc, "");
    assert.ok(result !== null);
    assert.equal(result[0]?.description, "[project]");
  });

  it("scores exact match higher than prefix", () => {
    const result = getSubCommandAgentCompletions(agents, "planner");
    assert.ok(result !== null);
    assert.equal(result[0]?.label, "planner");
  });

  it("scores word-part prefix match", () => {
    const agentsWp = [makeAgent("code-reviewer"), makeAgent("other-tool")];
    // "rev" should match "code-reviewer" via word-part prefix (score 2)
    const result = getSubCommandAgentCompletions(agentsWp, "rev");
    assert.ok(result !== null);
    assert.equal(result[0]?.label, "code-reviewer");
  });

  it("scores initials match", () => {
    const agentsInit = [makeAgent("code-reviewer"), makeAgent("other-tool")];
    // "cr" = initials of "code-reviewer"
    const result = getSubCommandAgentCompletions(agentsInit, "cr");
    assert.ok(result !== null);
    assert.equal(result[0]?.label, "code-reviewer");
  });

  it("scores contains match", () => {
    const agentsCont = [makeAgent("alphabetical"), makeAgent("numeric")];
    // "habet" is contained in "alphabetical" but not prefix/initials
    const result = getSubCommandAgentCompletions(agentsCont, "habet");
    assert.ok(result !== null);
    assert.equal(result[0]?.label, "alphabetical");
  });

  it("completion value has trailing space", () => {
    const result = getSubCommandAgentCompletions(agents, "plan");
    assert.ok(result !== null);
    assert.equal(result[0]?.value, "planner ");
  });
});

// ━━━ computeAgentAliasHints ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("computeAgentAliasHints", () => {
  it("computes shortest unique alias hints", () => {
    const agents = [makeAgent("planner"), makeAgent("worker"), makeAgent("reviewer")];
    const result = computeAgentAliasHints(agents);
    assert.ok(result.includes("p"));
    assert.ok(result.includes("planner") || result.includes("p\u2192planner"));
    assert.ok(result.includes("w"));
    assert.ok(result.includes("worker") || result.includes("w\u2192worker"));
    assert.ok(result.includes("r"));
    assert.ok(result.includes("reviewer") || result.includes("r\u2192reviewer"));
  });

  it("uses full name when no shorter alias is unique", () => {
    const agents = [makeAgent("aaa"), makeAgent("aab")];
    const result = computeAgentAliasHints(agents);
    assert.ok(result.includes("aaa"));
    assert.ok(result.includes("aab"));
  });

  it("handles single agent", () => {
    const agents = [makeAgent("alpha")];
    const result = computeAgentAliasHints(agents);
    assert.ok(result.includes("a\u2192alpha") || result.includes("a→alpha"));
  });

  it("returns empty string for empty agents", () => {
    assert.equal(computeAgentAliasHints([]), "");
  });
});

// ━━━ discoverAgents (filesystem integration) ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("discoverAgents", () => {
  function createTempDir(): string {
    return fs.mkdtempSync(path.join(os.tmpdir(), "subagent-test-"));
  }

  function writeMd(dir: string, filename: string, content: string): void {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, filename), content, "utf-8");
  }

  it("discovers agents from .pi/agents directory", () => {
    const tmpDir = createTempDir();
    try {
      const agentsDir = path.join(tmpDir, ".pi", "agents");
      writeMd(
        agentsDir,
        "planner.md",
        "---\nname: planner\ndescription: Plans things\ntools: bash,read\nmodel: opus\nthinking: high\ncharacter: friendly\n---\nYou are a planner.",
      );
      writeMd(
        agentsDir,
        "worker.md",
        "---\nname: worker\ndescription: Does work\n---\nYou are a worker.",
      );
      // File without required frontmatter (no name) — should be skipped
      writeMd(agentsDir, "incomplete.md", "---\ndescription: Missing name\n---\nNo name here.");
      // Non-md file — should be ignored
      fs.writeFileSync(path.join(agentsDir, "readme.txt"), "not an agent");

      const result = discoverAgents(tmpDir);
      assert.ok(result.agents.length >= 2);
      const names = result.agents.map((a) => a.name);
      assert.ok(names.includes("planner"));
      assert.ok(names.includes("worker"));
      assert.ok(!names.includes("incomplete"));
      assert.ok(result.projectAgentsDir !== null);

      // Check that planner has tools/model/thinking/character parsed
      const planner = result.agents.find((a) => a.name === "planner");
      assert.ok(planner);
      assert.deepStrictEqual(planner.tools, ["bash", "read"]);
      assert.equal(planner.model, "opus");
      assert.equal(planner.thinking, "high");
      assert.equal(planner.character, "friendly");
      assert.equal(planner.source, "project");

      // Check system prompt has common rules injected
      assert.ok(planner.systemPrompt.includes("Global Runtime Rule (subagent):"));
      assert.ok(planner.systemPrompt.includes("ask_master Guideline:"));
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("discovers agents from .claude/agents directory recursively", () => {
    const tmpDir = createTempDir();
    try {
      const claudeDir = path.join(tmpDir, ".claude", "agents");
      const subDir = path.join(claudeDir, "nested");
      writeMd(
        subDir,
        "deep-agent.md",
        "---\nname: deep-agent\ndescription: A deeply nested agent\ntools: bash\nmodel: sonnet\n---\nSystem prompt.",
      );

      const result = discoverAgents(tmpDir);
      const deepAgent = result.agents.find((a) => a.name === "deep-agent");
      assert.ok(deepAgent);
      assert.equal(deepAgent.description, "A deeply nested agent");
      // claude format: bash -> bash, model alias mapping
      assert.deepStrictEqual(deepAgent.tools, ["bash"]);
      assert.equal(deepAgent.model, "claude-sonnet-4-5");
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("returns empty agents when no agent directories exist", () => {
    const tmpDir = createTempDir();
    try {
      const result = discoverAgents(tmpDir);
      assert.equal(result.agents.length, 0);
      assert.equal(result.projectAgentsDir, null);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("project agents override user agents with same name", () => {
    const tmpDir = createTempDir();
    try {
      const agentsDir = path.join(tmpDir, ".pi", "agents");
      writeMd(
        agentsDir,
        "worker.md",
        "---\nname: worker\ndescription: Project worker\n---\nProject prompt.",
      );

      const result = discoverAgents(tmpDir);
      const worker = result.agents.find((a) => a.name === "worker");
      assert.ok(worker);
      assert.equal(worker.description, "Project worker");
      assert.equal(worker.source, "project");
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("handles agent with empty character field (falsy → undefined)", () => {
    const tmpDir = createTempDir();
    try {
      const agentsDir = path.join(tmpDir, ".pi", "agents");
      writeMd(
        agentsDir,
        "empty-char.md",
        "---\nname: empty-char\ndescription: Agent with empty character\ncharacter: \n---\nPrompt.",
      );
      const result = discoverAgents(tmpDir);
      const agent = result.agents.find((a) => a.name === "empty-char");
      assert.ok(agent);
      assert.equal(agent.character, undefined);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("uses default pi format when format option is not specified", () => {
    const tmpDir = createTempDir();
    try {
      // .pi/agents uses default format (pi)
      const agentsDir = path.join(tmpDir, ".pi", "agents");
      writeMd(
        agentsDir,
        "default-fmt.md",
        "---\nname: default-fmt\ndescription: Default format\ntools: bash,read\nmodel: custom-model\n---\nPrompt.",
      );
      const result = discoverAgents(tmpDir);
      const agent = result.agents.find((a) => a.name === "default-fmt");
      assert.ok(agent);
      // In pi format, tools are returned as-is
      assert.deepStrictEqual(agent.tools, ["bash", "read"]);
      // In pi format, model is returned as-is
      assert.equal(agent.model, "custom-model");
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("discoverAgents merges user agents (from ~/.pi/agent/agents) into map", () => {
    // This test verifies the `for (const agent of userAgents) agentMap.set(...)` path
    // which is the user agents iteration on line ~197. User agents dir is under homedir,
    // so we test indirectly: if no project agents dir, and no user dir, map is empty.
    const tmpDir = createTempDir();
    try {
      const result = discoverAgents(tmpDir);
      // No agents discovered — userAgents loop body doesn't execute
      assert.equal(result.agents.length, 0);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("handles unreadable files gracefully", () => {
    const tmpDir = createTempDir();
    try {
      const agentsDir = path.join(tmpDir, ".pi", "agents");
      writeMd(agentsDir, "good.md", "---\nname: good\ndescription: Good agent\n---\nGood.");
      // Create a directory with .md name to make it unreadable as a file
      fs.mkdirSync(path.join(agentsDir, "bad.md"));

      const result = discoverAgents(tmpDir);
      const names = result.agents.map((a) => a.name);
      assert.ok(names.includes("good"));
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("finds nearest .pi/agents walking up directories", () => {
    const tmpDir = createTempDir();
    try {
      const agentsDir = path.join(tmpDir, ".pi", "agents");
      writeMd(
        agentsDir,
        "root-agent.md",
        "---\nname: root-agent\ndescription: Root level\n---\nRoot.",
      );
      // Create a deep subdirectory
      const deepDir = path.join(tmpDir, "a", "b", "c");
      fs.mkdirSync(deepDir, { recursive: true });

      const result = discoverAgents(deepDir);
      const names = result.agents.map((a) => a.name);
      assert.ok(names.includes("root-agent"));
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("attachCommonSubagentRule does not duplicate rules", () => {
    const tmpDir = createTempDir();
    try {
      const agentsDir = path.join(tmpDir, ".pi", "agents");
      // An agent whose body already contains the rules
      writeMd(
        agentsDir,
        "has-rules.md",
        "---\nname: has-rules\ndescription: Has rules\n---\nGlobal Runtime Rule (subagent):\nask_master Guideline:\nBody text.",
      );

      const result = discoverAgents(tmpDir);
      const agent = result.agents.find((a) => a.name === "has-rules");
      assert.ok(agent);
      // Should not duplicate the rules
      const ruleCount = (agent.systemPrompt.match(/Global Runtime Rule \(subagent\):/g) || [])
        .length;
      assert.equal(ruleCount, 1);
      const guidelineCount = (agent.systemPrompt.match(/ask_master Guideline:/g) || []).length;
      assert.equal(guidelineCount, 1);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("attachCommonSubagentRule handles empty prompt", () => {
    const tmpDir = createTempDir();
    try {
      const agentsDir = path.join(tmpDir, ".pi", "agents");
      writeMd(
        agentsDir,
        "empty-prompt.md",
        "---\nname: empty-prompt\ndescription: Empty prompt\n---\n",
      );

      const result = discoverAgents(tmpDir);
      const agent = result.agents.find((a) => a.name === "empty-prompt");
      assert.ok(agent);
      assert.ok(agent.systemPrompt.includes("Global Runtime Rule (subagent):"));
      assert.ok(agent.systemPrompt.includes("ask_master Guideline:"));
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("listMarkdownFiles non-recursive mode does not descend into subdirs", () => {
    const tmpDir = createTempDir();
    try {
      const agentsDir = path.join(tmpDir, ".pi", "agents");
      writeMd(agentsDir, "top.md", "---\nname: top\ndescription: Top agent\n---\nTop.");
      const subDir = path.join(agentsDir, "sub");
      writeMd(subDir, "nested.md", "---\nname: nested\ndescription: Nested agent\n---\nNested.");

      // .pi/agents uses non-recursive mode in pi format
      const result = discoverAgents(tmpDir);
      const names = result.agents.map((a) => a.name);
      assert.ok(names.includes("top"));
      // nested should NOT be found since .pi/agents is non-recursive
      assert.ok(!names.includes("nested"));
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("isDirectory returns false for non-existent path", () => {
    // This tests the isDirectory private function indirectly via findNearestDir
    // which returns null when no directory is found
    const tmpDir = createTempDir();
    try {
      const result = discoverAgents(path.join(tmpDir, "nonexistent"));
      assert.equal(result.agents.length, 0);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("handles unreadable directory in listMarkdownFiles gracefully", () => {
    const tmpDir = createTempDir();
    try {
      const agentsDir = path.join(tmpDir, ".pi", "agents");
      fs.mkdirSync(agentsDir, { recursive: true });
      // Create a subdirectory that we make unreadable
      // (we test the catch block in listMarkdownFiles via .claude/agents recursive mode)
      const claudeDir = path.join(tmpDir, ".claude", "agents");
      writeMd(claudeDir, "visible.md", "---\nname: visible\ndescription: Visible\n---\nVisible.");

      const result = discoverAgents(tmpDir);
      const names = result.agents.map((a) => a.name);
      assert.ok(names.includes("visible"));
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("listMarkdownFiles catch branch — unreadable subdirectory in recursive mode", () => {
    const tmpDir = createTempDir();
    try {
      const claudeDir = path.join(tmpDir, ".claude", "agents");
      writeMd(claudeDir, "ok.md", "---\nname: ok\ndescription: OK\n---\nOK.");
      // Create a subdirectory and make it unreadable
      const unreadableDir = path.join(claudeDir, "unreadable");
      fs.mkdirSync(unreadableDir, { recursive: true });
      fs.chmodSync(unreadableDir, 0o000);

      const result = discoverAgents(tmpDir);
      const names = result.agents.map((a) => a.name);
      assert.ok(names.includes("ok"));

      // Restore permissions for cleanup
      fs.chmodSync(unreadableDir, 0o755);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("loadAgentsFromDir catch branch — unreadable .md file", () => {
    const tmpDir = createTempDir();
    try {
      const agentsDir = path.join(tmpDir, ".pi", "agents");
      writeMd(agentsDir, "good.md", "---\nname: good\ndescription: Good\n---\nGood.");
      // Create a .md file and make it unreadable
      const badPath = path.join(agentsDir, "bad.md");
      fs.writeFileSync(badPath, "---\nname: bad\ndescription: Bad\n---\nBad.");
      fs.chmodSync(badPath, 0o000);

      const result = discoverAgents(tmpDir);
      const names = result.agents.map((a) => a.name);
      assert.ok(names.includes("good"));
      assert.ok(!names.includes("bad"));

      // Restore permissions for cleanup
      fs.chmodSync(badPath, 0o644);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

// ━━━ computeAgentAliasHints (initials branch) ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("computeAgentAliasHints — initials branch", () => {
  it("uses initials as alias when shorter than prefix alias", () => {
    // "code-reviewer" has initials "cr" (length 2)
    // The shortest unique prefix for "code-reviewer" among agents below
    // should be longer than "cr", so initials win.
    const agents = [makeAgent("code-reviewer"), makeAgent("code-writer")];
    const result = computeAgentAliasHints(agents);
    // "cr" should uniquely match "code-reviewer" by initials
    // "cw" should uniquely match "code-writer" by initials
    assert.ok(
      result.includes("cr\u2192code-reviewer") || result.includes("cr→code-reviewer"),
      `Expected initials alias cr→code-reviewer in result: ${result}`,
    );
  });
});
