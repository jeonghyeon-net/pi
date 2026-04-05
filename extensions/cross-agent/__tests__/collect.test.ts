import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { after, before, describe, it } from "node:test";
import { collectGroups } from "../core/collect.js";

// ━━━ Temp setup ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "cross-agent-collect-test-"));
const fakeHome = path.join(tmpRoot, "home");
const cwdDir = path.join(tmpRoot, "proj");

fs.mkdirSync(fakeHome, { recursive: true });
fs.mkdirSync(cwdDir, { recursive: true });

const originalHome = process.env.HOME;
const originalUserProfile = process.env.USERPROFILE;

before(() => {
  // os.homedir() on POSIX reads HOME; on Windows USERPROFILE.
  process.env.HOME = fakeHome;
  process.env.USERPROFILE = fakeHome;
});

after(() => {
  if (originalHome === undefined) {
    Reflect.deleteProperty(process.env, "HOME");
  } else {
    process.env.HOME = originalHome;
  }
  if (originalUserProfile === undefined) {
    Reflect.deleteProperty(process.env, "USERPROFILE");
  } else {
    process.env.USERPROFILE = originalUserProfile;
  }
  try {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  } catch {
    // ignore
  }
});

function writeFile(filePath: string, content: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf-8");
}

// ━━━ collectGroups ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("collectGroups", () => {
  it("returns empty array when no sources exist", () => {
    // Use a brand-new empty cwd
    const emptyCwd = path.join(tmpRoot, "empty-proj");
    fs.mkdirSync(emptyCwd, { recursive: true });
    const groups = collectGroups(emptyCwd);
    assert.deepStrictEqual(groups, []);
  });

  it("scans .claude/.gemini/.codex under cwd and home with commands/skills/agents", () => {
    const localCwd = path.join(tmpRoot, "proj-claude");
    fs.mkdirSync(localCwd, { recursive: true });

    // Local .claude with commands and skill
    writeFile(
      path.join(localCwd, ".claude", "commands", "greet.md"),
      "---\ndescription: greet\n---\nHello",
    );
    writeFile(path.join(localCwd, ".claude", "skills", "mySkill", "SKILL.md"), "s");

    // Home .gemini with agents
    writeFile(
      path.join(fakeHome, ".gemini", "agents", "worker.md"),
      "---\nname: worker\ndescription: w\n---\nbody",
    );

    const groups = collectGroups(localCwd);
    const sources = groups.map((g) => g.source).sort();
    assert.deepStrictEqual(sources, [".claude", "~/.gemini"]);

    const claudeGroup = groups.find((g) => g.source === ".claude");
    assert.ok(claudeGroup);
    assert.equal(claudeGroup.commands.length, 1);
    assert.equal(claudeGroup.commands[0]?.name, "greet");
    assert.deepStrictEqual(claudeGroup.skills, ["mySkill"]);
    assert.deepStrictEqual(claudeGroup.agents, []);

    const geminiGroup = groups.find((g) => g.source === "~/.gemini");
    assert.ok(geminiGroup);
    assert.equal(geminiGroup.agents.length, 1);
    assert.equal(geminiGroup.agents[0]?.name, "worker");
    assert.deepStrictEqual(geminiGroup.commands, []);
  });

  it("adds .pi/agents group when local agents exist", () => {
    const piCwd = path.join(tmpRoot, "proj-pi");
    fs.mkdirSync(piCwd, { recursive: true });
    writeFile(
      path.join(piCwd, ".pi", "agents", "local.md"),
      "---\nname: local\ndescription: loc\n---\nbody",
    );

    const groups = collectGroups(piCwd);
    const piGroup = groups.find((g) => g.source === ".pi/agents");
    assert.ok(piGroup);
    assert.equal(piGroup.commands.length, 0);
    assert.equal(piGroup.skills.length, 0);
    assert.equal(piGroup.agents.length, 1);
    assert.equal(piGroup.agents[0]?.name, "local");
  });

  it("does not add .pi/agents group when no local agents exist", () => {
    const piCwd = path.join(tmpRoot, "proj-nopi");
    fs.mkdirSync(piCwd, { recursive: true });
    const groups = collectGroups(piCwd);
    assert.ok(!groups.some((g) => g.source === ".pi/agents"));
  });

  it("skips provider groups with zero items", () => {
    const emptyCwd = path.join(tmpRoot, "proj-empty-provider");
    fs.mkdirSync(path.join(emptyCwd, ".codex"), { recursive: true });
    // Create the .codex dir but no commands/skills/agents inside
    const groups = collectGroups(emptyCwd);
    assert.ok(!groups.some((g) => g.source === ".codex"));
  });

  it("collects all three providers when each has content", () => {
    const triCwd = path.join(tmpRoot, "proj-tri");
    fs.mkdirSync(triCwd, { recursive: true });
    writeFile(path.join(triCwd, ".claude", "commands", "c.md"), "c");
    writeFile(path.join(triCwd, ".gemini", "commands", "g.md"), "g");
    writeFile(path.join(triCwd, ".codex", "commands", "x.md"), "x");

    const groups = collectGroups(triCwd);
    const localSources = groups.map((g) => g.source).filter((s) => !s.startsWith("~"));
    assert.deepStrictEqual(localSources.sort(), [".claude", ".codex", ".gemini"]);
  });

  it("respects ordering: cwd before home for each provider", () => {
    const orderCwd = path.join(tmpRoot, "proj-order");
    fs.mkdirSync(orderCwd, { recursive: true });
    writeFile(path.join(orderCwd, ".claude", "commands", "local.md"), "l");
    // Home commands for .claude (may already exist from prior test — fine, we only check order)
    writeFile(path.join(fakeHome, ".claude", "commands", "homecmd.md"), "h");

    const groups = collectGroups(orderCwd);
    const claudeIndices = groups
      .map((g, i) => ({ src: g.source, i }))
      .filter((x) => x.src === ".claude" || x.src === "~/.claude");
    // Local must appear before home
    const localIdx = claudeIndices.find((x) => x.src === ".claude")?.i;
    const homeIdx = claudeIndices.find((x) => x.src === "~/.claude")?.i;
    assert.ok(localIdx !== undefined);
    assert.ok(homeIdx !== undefined);
    assert.ok(localIdx < homeIdx);
  });
});
