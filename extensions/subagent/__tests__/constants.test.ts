import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AGENT_SYMBOL_MAP, formatSymbolHints } from "../core/constants.js";

describe("formatSymbolHints", () => {
  it("formats hints with default prefix >>", () => {
    const result = formatSymbolHints();
    // Check each symbol mapping is present
    for (const [sym, agent] of Object.entries(AGENT_SYMBOL_MAP)) {
      assert.ok(result.includes(`>>${sym} ${agent}`), `Expected >>${sym} ${agent} in result`);
    }
    // Check hints are separated by double spaces
    assert.ok(result.includes("  "));
  });

  it("formats hints with custom prefix", () => {
    const result = formatSymbolHints(">>>");
    for (const [sym, agent] of Object.entries(AGENT_SYMBOL_MAP)) {
      assert.ok(result.includes(`>>>${sym} ${agent}`), `Expected >>>${sym} ${agent} in result`);
    }
  });

  it("returns non-empty string", () => {
    const result = formatSymbolHints();
    assert.ok(result.length > 0);
  });
});
