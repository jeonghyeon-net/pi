import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MAX_TOOL_NAME_LENGTH, MCP_TOOL_NAME_PREFIX } from "../core/constants.js";
import { buildPiToolName, sanitizeName } from "../core/tool-naming.js";

describe("sanitizeName", () => {
  it("lowercases ASCII letters", () => {
    assert.equal(sanitizeName("HelloWorld"), "helloworld");
  });

  it("replaces runs of disallowed characters with single underscore", () => {
    assert.equal(sanitizeName("hello world"), "hello_world");
    assert.equal(sanitizeName("foo---bar!!!baz"), "foo_bar_baz");
  });

  it("keeps digits and underscores intact", () => {
    assert.equal(sanitizeName("abc_123"), "abc_123");
  });

  it("trims leading and trailing underscores", () => {
    assert.equal(sanitizeName("__hello__"), "hello");
    assert.equal(sanitizeName("!!!abc!!!"), "abc");
  });

  it("returns empty string when all characters are disallowed", () => {
    assert.equal(sanitizeName("!!!"), "");
    assert.equal(sanitizeName(""), "");
  });

  it("truncates to MAX_TOOL_NAME_LENGTH", () => {
    const long = "a".repeat(MAX_TOOL_NAME_LENGTH + 50);
    const result = sanitizeName(long);
    assert.equal(result.length, MAX_TOOL_NAME_LENGTH);
    assert.equal(result, "a".repeat(MAX_TOOL_NAME_LENGTH));
  });

  it("handles unicode by replacing with underscores", () => {
    assert.equal(sanitizeName("héllo"), "h_llo");
    assert.equal(sanitizeName("日本語"), "");
  });
});

describe("buildPiToolName", () => {
  it("combines sanitized server and tool with prefix", () => {
    assert.equal(buildPiToolName("MyServer", "MyTool"), `${MCP_TOOL_NAME_PREFIX}myserver_mytool`);
  });

  it("falls back to 'server' when server sanitizes to empty", () => {
    assert.equal(buildPiToolName("!!!", "tool"), `${MCP_TOOL_NAME_PREFIX}server_tool`);
  });

  it("falls back to 'tool' when tool sanitizes to empty", () => {
    assert.equal(buildPiToolName("server", "!!!"), `${MCP_TOOL_NAME_PREFIX}server_tool`);
  });

  it("uses both fallbacks when both sanitize to empty", () => {
    assert.equal(buildPiToolName("", ""), `${MCP_TOOL_NAME_PREFIX}server_tool`);
  });

  it("sanitizes special characters in both parts", () => {
    assert.equal(
      buildPiToolName("my-server.v2", "run tool!"),
      `${MCP_TOOL_NAME_PREFIX}my_server_v2_run_tool`,
    );
  });
});
