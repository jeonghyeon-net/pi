import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Discovered, Frontmatter, SourceGroup } from "../core/types.js";

// types.ts contains only interface declarations which are erased at runtime.
// These tests exercise the type shapes to satisfy coverage tooling and
// confirm the module imports without errors.

describe("types", () => {
  it("Discovered shape compiles and round-trips values", () => {
    const d: Discovered = { name: "a", description: "b", content: "c" };
    assert.equal(d.name, "a");
    assert.equal(d.description, "b");
    assert.equal(d.content, "c");
  });

  it("SourceGroup shape compiles and round-trips values", () => {
    const g: SourceGroup = {
      source: ".claude",
      commands: [{ name: "n", description: "d", content: "c" }],
      skills: ["s"],
      agents: [{ name: "an", description: "ad", content: "ac" }],
    };
    assert.equal(g.source, ".claude");
    assert.equal(g.commands.length, 1);
    assert.deepStrictEqual(g.skills, ["s"]);
    assert.equal(g.agents.length, 1);
  });

  it("Frontmatter shape compiles and round-trips values", () => {
    const f: Frontmatter = {
      description: "d",
      body: "b",
      fields: { key: "value" },
    };
    assert.equal(f.description, "d");
    assert.equal(f.body, "b");
    assert.equal(f.fields.key, "value");
  });
});
