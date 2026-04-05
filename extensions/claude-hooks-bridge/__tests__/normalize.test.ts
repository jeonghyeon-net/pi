import assert from "node:assert/strict";
import path from "node:path";
import { describe, it } from "node:test";
import { extractTextFromBlocks, normalizeToolInput } from "../core/normalize.js";

// ━━━ normalizeToolInput ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("normalizeToolInput", () => {
  const cwd = path.resolve("/tmp/work");

  it("returns empty object when rawInput is null/undefined", () => {
    assert.deepEqual(normalizeToolInput("read", null, cwd), {});
    assert.deepEqual(normalizeToolInput("read", undefined, cwd), {});
  });

  it("returns empty object when rawInput is a non-object (string/number)", () => {
    assert.deepEqual(normalizeToolInput("read", "x", cwd), {});
    assert.deepEqual(normalizeToolInput("read", 42, cwd), {});
  });

  it("resolves absolute path unchanged (normalized)", () => {
    const out = normalizeToolInput("read", { path: "/abs/path/to/file.ts" }, cwd);
    assert.equal(out.path, path.normalize("/abs/path/to/file.ts"));
    assert.equal(out.file_path, path.normalize("/abs/path/to/file.ts"));
    assert.equal(out.filePath, path.normalize("/abs/path/to/file.ts"));
  });

  it("normalizes absolute path with redundant segments", () => {
    const out = normalizeToolInput("read", { path: "/a/b/../c" }, cwd);
    assert.equal(out.path, path.normalize("/a/c"));
  });

  it("resolves relative path against cwd", () => {
    const out = normalizeToolInput("read", { path: "file.ts" }, cwd);
    assert.equal(out.path, path.resolve(cwd, "file.ts"));
    assert.equal(out.file_path, path.resolve(cwd, "file.ts"));
    assert.equal(out.filePath, path.resolve(cwd, "file.ts"));
  });

  it("uses file_path when path is missing", () => {
    const out = normalizeToolInput("read", { file_path: "src/index.ts" }, cwd);
    assert.equal(out.file_path, path.resolve(cwd, "src/index.ts"));
    assert.equal(out.path, path.resolve(cwd, "src/index.ts"));
  });

  it("uses filePath when path and file_path are missing", () => {
    const out = normalizeToolInput("read", { filePath: "data.json" }, cwd);
    assert.equal(out.filePath, path.resolve(cwd, "data.json"));
    assert.equal(out.path, path.resolve(cwd, "data.json"));
    assert.equal(out.file_path, path.resolve(cwd, "data.json"));
  });

  it("ignores non-string path candidates", () => {
    const out = normalizeToolInput("read", { path: 42, file_path: "ok.ts" }, cwd);
    // path candidate falls through to file_path because path is not a string
    assert.equal(out.file_path, path.resolve(cwd, "ok.ts"));
  });

  it("ignores non-string file_path when path missing", () => {
    const out = normalizeToolInput("read", { file_path: 42, filePath: "ok.ts" }, cwd);
    assert.equal(out.filePath, path.resolve(cwd, "ok.ts"));
  });

  it("returns input unmodified when no path candidate", () => {
    const out = normalizeToolInput("custom", { foo: "bar", baz: 1 }, cwd);
    assert.equal(out.foo, "bar");
    assert.equal(out.baz, 1);
    assert.equal(out.path, undefined);
  });

  it("sets empty bash command when missing", () => {
    const out = normalizeToolInput("bash", {}, cwd);
    assert.equal(out.command, "");
  });

  it("sets empty bash command when command is not a string", () => {
    const out = normalizeToolInput("bash", { command: 42 }, cwd);
    assert.equal(out.command, "");
  });

  it("leaves bash command unchanged when already a string", () => {
    const out = normalizeToolInput("bash", { command: "ls -la" }, cwd);
    assert.equal(out.command, "ls -la");
  });

  it("does not set empty command for non-bash tools", () => {
    const out = normalizeToolInput("read", {}, cwd);
    assert.equal(out.command, undefined);
  });

  it("returns a shallow copy (does not mutate original)", () => {
    const raw = { path: "a.ts", extra: "keep" };
    const out = normalizeToolInput("read", raw, cwd);
    assert.equal(raw.path, "a.ts"); // original untouched
    assert.equal(out.extra, "keep");
  });
});

// ━━━ extractTextFromBlocks ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("extractTextFromBlocks", () => {
  it("returns string input unchanged", () => {
    assert.equal(extractTextFromBlocks("hello"), "hello");
    assert.equal(extractTextFromBlocks(""), "");
  });

  it("returns empty string for non-array non-string inputs", () => {
    assert.equal(extractTextFromBlocks(null), "");
    assert.equal(extractTextFromBlocks(undefined), "");
    assert.equal(extractTextFromBlocks(42), "");
    assert.equal(extractTextFromBlocks({ text: "ignored" }), "");
  });

  it("concatenates text blocks", () => {
    const blocks = [{ text: "a" }, { text: "b" }, { text: "c" }];
    assert.equal(extractTextFromBlocks(blocks), "abc");
  });

  it("skips non-object and null blocks", () => {
    const blocks = [null, "str", 42, { text: "only this" }];
    assert.equal(extractTextFromBlocks(blocks), "only this");
  });

  it("skips blocks where text is not a string", () => {
    const blocks = [{ text: 42 }, { text: null }, { text: "kept" }];
    assert.equal(extractTextFromBlocks(blocks), "kept");
  });

  it("returns empty string for empty array", () => {
    assert.equal(extractTextFromBlocks([]), "");
  });
});
