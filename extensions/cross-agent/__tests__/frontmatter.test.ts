import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { expandArgs, parseFrontmatter } from "../core/frontmatter.js";

// ━━━ parseFrontmatter ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("parseFrontmatter", () => {
  it("returns empty description and raw body when no frontmatter", () => {
    const result = parseFrontmatter("just a body\nwith lines");
    assert.equal(result.description, "");
    assert.equal(result.body, "just a body\nwith lines");
    assert.deepStrictEqual(result.fields, {});
  });

  it("parses frontmatter with description", () => {
    const raw = "---\ndescription: hello world\n---\nbody content";
    const result = parseFrontmatter(raw);
    assert.equal(result.description, "hello world");
    assert.equal(result.body, "body content");
    assert.equal(result.fields.description, "hello world");
  });

  it("parses multiple fields", () => {
    const raw = "---\nname: foo\ndescription: bar\nauthor: baz\n---\nbody";
    const result = parseFrontmatter(raw);
    assert.equal(result.fields.name, "foo");
    assert.equal(result.fields.description, "bar");
    assert.equal(result.fields.author, "baz");
    assert.equal(result.description, "bar");
    assert.equal(result.body, "body");
  });

  it("uses empty description when no description field", () => {
    const raw = "---\nname: foo\n---\nbody";
    const result = parseFrontmatter(raw);
    assert.equal(result.description, "");
    assert.equal(result.fields.name, "foo");
  });

  it("ignores lines without colon", () => {
    const raw = "---\nname: foo\ninvalidline\n---\nbody";
    const result = parseFrontmatter(raw);
    assert.equal(result.fields.name, "foo");
    assert.equal(result.fields.invalidline, undefined);
  });

  it("ignores lines where colon is at index 0", () => {
    const raw = "---\n: nocolonbefore\nname: foo\n---\nbody";
    const result = parseFrontmatter(raw);
    assert.equal(result.fields.name, "foo");
    // `:` at index 0 means idx === 0, skipped by idx > 0 check
    assert.equal(Object.keys(result.fields).length, 1);
  });

  it("trims whitespace around keys and values", () => {
    const raw = "---\n  name  :   foo bar   \n---\nbody";
    const result = parseFrontmatter(raw);
    assert.equal(result.fields.name, "foo bar");
  });

  it("handles value with colon inside", () => {
    const raw = "---\nkey: value:with:colons\n---\nbody";
    const result = parseFrontmatter(raw);
    assert.equal(result.fields.key, "value:with:colons");
  });

  it("preserves body content with multiple lines", () => {
    const raw = "---\ndescription: d\n---\nline 1\nline 2\nline 3";
    const result = parseFrontmatter(raw);
    assert.equal(result.body, "line 1\nline 2\nline 3");
  });

  it("handles empty frontmatter block", () => {
    const raw = "---\n\n---\nbody";
    const result = parseFrontmatter(raw);
    assert.equal(result.description, "");
    assert.equal(result.body, "body");
    assert.deepStrictEqual(result.fields, {});
  });

  it("returns fallback when frontmatter fences malformed (no closing)", () => {
    const raw = "---\ndescription: test\nbody";
    const result = parseFrontmatter(raw);
    assert.equal(result.description, "");
    assert.equal(result.body, raw);
    assert.deepStrictEqual(result.fields, {});
  });
});

// ━━━ expandArgs ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("expandArgs", () => {
  it("replaces $ARGUMENTS with full args string", () => {
    assert.equal(expandArgs("run $ARGUMENTS now", "foo bar"), "run foo bar now");
  });

  it("replaces $@ with full args string", () => {
    assert.equal(expandArgs("run $@ now", "foo bar"), "run foo bar now");
  });

  it("replaces both $ARGUMENTS and $@ when both present", () => {
    assert.equal(expandArgs("$ARGUMENTS and $@", "x y"), "x y and x y");
  });

  it("replaces positional $1, $2, $3", () => {
    assert.equal(expandArgs("$1 + $2 = $3", "a b c"), "a + b = c");
  });

  it("replaces repeated positional tokens", () => {
    assert.equal(expandArgs("$1 $1 $1", "x"), "x x x");
  });

  it("handles empty args string", () => {
    assert.equal(expandArgs("prefix $ARGUMENTS suffix", ""), "prefix  suffix");
  });

  it("does not replace missing positional args", () => {
    assert.equal(expandArgs("$1 $2 $3", "only"), "only $2 $3");
  });

  it("handles multi-whitespace separators", () => {
    assert.equal(expandArgs("$1-$2", "foo    bar"), "foo-bar");
  });

  it("returns template unchanged when no placeholders and no args", () => {
    assert.equal(expandArgs("plain text", ""), "plain text");
  });

  it("handles template without placeholders", () => {
    assert.equal(expandArgs("no placeholders", "some args"), "no placeholders");
  });

  it("replaces positional and $ARGUMENTS together", () => {
    assert.equal(expandArgs("[$1] ($ARGUMENTS)", "foo bar"), "[foo] (foo bar)");
  });
});
