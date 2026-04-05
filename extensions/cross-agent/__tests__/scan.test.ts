import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { after, describe, it } from "node:test";
import { scanAgents, scanCommands, scanSkills } from "../core/scan.js";

// ━━━ Temp dir management ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "cross-agent-scan-test-"));

after(() => {
  try {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  } catch {
    // ignore cleanup errors
  }
});

function makeDir(name: string): string {
  const dir = path.join(tmpRoot, name);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function writeFile(filePath: string, content: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf-8");
}

// ━━━ scanCommands ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("scanCommands", () => {
  it("returns empty array when directory does not exist", () => {
    const result = scanCommands(path.join(tmpRoot, "nonexistent"));
    assert.deepStrictEqual(result, []);
  });

  it("returns empty array when directory is empty", () => {
    const dir = makeDir("cmds-empty");
    const result = scanCommands(dir);
    assert.deepStrictEqual(result, []);
  });

  it("scans .md commands with frontmatter description", () => {
    const dir = makeDir("cmds-fm");
    writeFile(path.join(dir, "greet.md"), "---\ndescription: Say hello\n---\nHello, $1!");
    const result = scanCommands(dir);
    assert.equal(result.length, 1);
    assert.equal(result[0]?.name, "greet");
    assert.equal(result[0]?.description, "Say hello");
    assert.equal(result[0]?.content, "Hello, $1!");
  });

  it("falls back to first non-empty body line when no description in frontmatter", () => {
    const dir = makeDir("cmds-fallback");
    writeFile(path.join(dir, "noop.md"), "---\nname: x\n---\n\n\nReal first line\nsecond");
    const result = scanCommands(dir);
    assert.equal(result.length, 1);
    assert.equal(result[0]?.description, "Real first line");
  });

  it("uses first non-empty line when no frontmatter at all", () => {
    const dir = makeDir("cmds-nofm");
    writeFile(path.join(dir, "plain.md"), "  \n\nfirst body line\nmore");
    const result = scanCommands(dir);
    assert.equal(result.length, 1);
    assert.equal(result[0]?.description, "first body line");
    assert.equal(result[0]?.content, "  \n\nfirst body line\nmore");
  });

  it("returns empty string description when body has only empty lines", () => {
    const dir = makeDir("cmds-empty-body");
    writeFile(path.join(dir, "empty.md"), "---\nname: x\n---\n\n   \n");
    const result = scanCommands(dir);
    assert.equal(result.length, 1);
    assert.equal(result[0]?.description, "");
  });

  it("skips non-.md files", () => {
    const dir = makeDir("cmds-mixed");
    writeFile(path.join(dir, "ignore.txt"), "nope");
    writeFile(path.join(dir, "keep.md"), "content");
    const result = scanCommands(dir);
    assert.equal(result.length, 1);
    assert.equal(result[0]?.name, "keep");
  });

  it("uses basename without extension", () => {
    const dir = makeDir("cmds-basename");
    writeFile(path.join(dir, "multi.part.name.md"), "body");
    const result = scanCommands(dir);
    assert.equal(result[0]?.name, "multi.part.name");
  });

  it("returns accumulated items when readdir throws mid-iteration", () => {
    // Pass a path that exists as a file, not a dir → readdirSync will throw
    const filePath = path.join(tmpRoot, "notadir.md");
    writeFile(filePath, "content");
    const result = scanCommands(filePath);
    assert.deepStrictEqual(result, []);
  });
});

// ━━━ scanSkills ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("scanSkills", () => {
  it("returns empty array when directory does not exist", () => {
    const result = scanSkills(path.join(tmpRoot, "missing-skills"));
    assert.deepStrictEqual(result, []);
  });

  it("returns empty array when directory is empty", () => {
    const dir = makeDir("skills-empty");
    const result = scanSkills(dir);
    assert.deepStrictEqual(result, []);
  });

  it("detects SKILL.md style subdirectories", () => {
    const dir = makeDir("skills-dir");
    writeFile(path.join(dir, "my-skill", "SKILL.md"), "content");
    const result = scanSkills(dir);
    assert.deepStrictEqual(result, ["my-skill"]);
  });

  it("detects flat .md skills", () => {
    const dir = makeDir("skills-flat");
    writeFile(path.join(dir, "flat.md"), "content");
    const result = scanSkills(dir);
    assert.deepStrictEqual(result, ["flat"]);
  });

  it("ignores entries that are neither SKILL.md subdirs nor flat .md", () => {
    const dir = makeDir("skills-bad");
    // Subdir without SKILL.md
    fs.mkdirSync(path.join(dir, "no-skill-file"), { recursive: true });
    // Non-md file
    writeFile(path.join(dir, "random.txt"), "x");
    const result = scanSkills(dir);
    assert.deepStrictEqual(result, []);
  });

  it("returns both SKILL.md dirs and flat .md skills", () => {
    const dir = makeDir("skills-both");
    writeFile(path.join(dir, "alpha", "SKILL.md"), "a");
    writeFile(path.join(dir, "beta.md"), "b");
    const result = scanSkills(dir).sort();
    assert.deepStrictEqual(result, ["alpha", "beta"]);
  });

  it("handles SKILL.md being a directory (not a file)", () => {
    const dir = makeDir("skills-dir-skillmd");
    // Create SKILL.md as a directory, not a file
    fs.mkdirSync(path.join(dir, "weird", "SKILL.md"), { recursive: true });
    const result = scanSkills(dir);
    assert.deepStrictEqual(result, []);
  });

  it("returns accumulated items on readdir throw", () => {
    const filePath = path.join(tmpRoot, "skillsnotadir.txt");
    writeFile(filePath, "content");
    const result = scanSkills(filePath);
    assert.deepStrictEqual(result, []);
  });
});

// ━━━ scanAgents ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("scanAgents", () => {
  it("returns empty array when directory does not exist", () => {
    const result = scanAgents(path.join(tmpRoot, "missing-agents"));
    assert.deepStrictEqual(result, []);
  });

  it("returns empty array when directory is empty", () => {
    const dir = makeDir("agents-empty");
    const result = scanAgents(dir);
    assert.deepStrictEqual(result, []);
  });

  it("scans agents with frontmatter name and description", () => {
    const dir = makeDir("agents-fm");
    const raw = "---\nname: worker\ndescription: do work\n---\nSystem prompt body";
    writeFile(path.join(dir, "w.md"), raw);
    const result = scanAgents(dir);
    assert.equal(result.length, 1);
    assert.equal(result[0]?.name, "worker");
    assert.equal(result[0]?.description, "do work");
    assert.equal(result[0]?.content, raw);
  });

  it("falls back to filename when no name in frontmatter", () => {
    const dir = makeDir("agents-noname");
    writeFile(path.join(dir, "fallback.md"), "---\ndescription: d\n---\nbody");
    const result = scanAgents(dir);
    assert.equal(result[0]?.name, "fallback");
    assert.equal(result[0]?.description, "d");
  });

  it("uses empty description when no description field", () => {
    const dir = makeDir("agents-nodesc");
    writeFile(path.join(dir, "agent.md"), "---\nname: bot\n---\nbody");
    const result = scanAgents(dir);
    assert.equal(result[0]?.description, "");
    assert.equal(result[0]?.name, "bot");
  });

  it("skips non-.md files", () => {
    const dir = makeDir("agents-skip");
    writeFile(path.join(dir, "readme.txt"), "x");
    writeFile(path.join(dir, "agent.md"), "---\nname: real\n---\nbody");
    const result = scanAgents(dir);
    assert.equal(result.length, 1);
    assert.equal(result[0]?.name, "real");
  });

  it("content preserves original raw file (including frontmatter)", () => {
    const dir = makeDir("agents-content");
    const raw = "---\nname: keep\n---\nsys body";
    writeFile(path.join(dir, "keep.md"), raw);
    const result = scanAgents(dir);
    assert.equal(result[0]?.content, raw);
  });

  it("returns accumulated items on readdir throw", () => {
    const filePath = path.join(tmpRoot, "agentsnotadir.txt");
    writeFile(filePath, "content");
    const result = scanAgents(filePath);
    assert.deepStrictEqual(result, []);
  });
});
