import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isSubagentAsyncLaunchCommand,
  parseSubagentCommandVerb,
  parseSubagentToolCommand,
} from "../cli/parser.js";

// ━━━ parseSubagentToolCommand ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("parseSubagentToolCommand", () => {
  // ── Info commands ──────────────────────────────────────────────────────

  it("parses 'help'", () => {
    const result = parseSubagentToolCommand("subagent help");
    assert.deepStrictEqual(result, { type: "help" });
  });

  it("parses bare 'subagent' as help", () => {
    const result = parseSubagentToolCommand("subagent");
    assert.deepStrictEqual(result, { type: "help" });
  });

  it("parses 'agents'", () => {
    const result = parseSubagentToolCommand("subagent agents");
    assert.deepStrictEqual(result, { type: "agents" });
  });

  it("parses 'runs'", () => {
    const result = parseSubagentToolCommand("subagent runs");
    assert.deepStrictEqual(result, { type: "params", params: { asyncAction: "list" } });
  });

  // ── status / detail ────────────────────────────────────────────────────

  it("parses 'status <runId>'", () => {
    const result = parseSubagentToolCommand("subagent status 42");
    assert.deepStrictEqual(result, {
      type: "params",
      params: { asyncAction: "status", runId: 42 },
    });
  });

  it("errors on status without runId", () => {
    const result = parseSubagentToolCommand("subagent status");
    assert.equal(result.type, "error");
  });

  it("errors on status with non-numeric runId", () => {
    const result = parseSubagentToolCommand("subagent status abc");
    assert.equal(result.type, "error");
    assert.ok(result.type === "error" && result.message.includes("abc"));
  });

  it("parses 'detail <runId>'", () => {
    const result = parseSubagentToolCommand("subagent detail 7");
    assert.deepStrictEqual(result, {
      type: "params",
      params: { asyncAction: "detail", runId: 7 },
    });
  });

  it("errors on detail without runId", () => {
    const result = parseSubagentToolCommand("subagent detail");
    assert.equal(result.type, "error");
  });

  // ── run ────────────────────────────────────────────────────────────────

  it("parses 'run <agent> -- <task>'", () => {
    const result = parseSubagentToolCommand("subagent run planner -- build login page");
    assert.deepStrictEqual(result, {
      type: "params",
      params: { agent: "planner", task: "build login page" },
    });
  });

  it("defaults agent to 'worker' when no agent specified", () => {
    const result = parseSubagentToolCommand("subagent run -- do something");
    assert.deepStrictEqual(result, {
      type: "params",
      params: { agent: "worker", task: "do something" },
    });
  });

  it("parses run with --main context mode", () => {
    const result = parseSubagentToolCommand("subagent run planner --main -- plan task");
    assert.equal(result.type, "params");
    if (result.type === "params") {
      assert.equal(result.params.agent, "planner");
      assert.equal(result.params.contextMode, "main");
      assert.equal(result.params.task, "plan task");
    }
  });

  it("parses run with --isolated context mode", () => {
    const result = parseSubagentToolCommand("subagent run planner --isolated -- plan task");
    assert.equal(result.type, "params");
    if (result.type === "params") {
      assert.equal(result.params.contextMode, "isolated");
    }
  });

  it("errors on run without -- separator", () => {
    const result = parseSubagentToolCommand("subagent run planner plan task");
    assert.equal(result.type, "error");
    assert.ok(result.type === "error" && result.message.includes("--"));
  });

  it("errors on run with empty task after --", () => {
    const result = parseSubagentToolCommand("subagent run planner --");
    assert.equal(result.type, "error");
    assert.ok(result.type === "error" && result.message.includes("Empty task"));
  });

  it("errors on run with --sync flag (deprecated)", () => {
    const result = parseSubagentToolCommand("subagent run planner --sync -- task");
    assert.equal(result.type, "error");
    assert.ok(result.type === "error" && result.message.includes("no longer supported"));
  });

  it("errors on run with --async flag (deprecated)", () => {
    const result = parseSubagentToolCommand("subagent run planner --async -- task");
    assert.equal(result.type, "error");
    assert.ok(result.type === "error" && result.message.includes("no longer supported"));
  });

  it("errors on run with unknown option", () => {
    const result = parseSubagentToolCommand("subagent run planner --verbose -- task");
    assert.equal(result.type, "error");
    assert.ok(result.type === "error" && result.message.includes("Unknown option"));
  });

  // ── continue ───────────────────────────────────────────────────────────

  it("parses 'continue <runId> -- <task>'", () => {
    const result = parseSubagentToolCommand("subagent continue 22 -- finish the work");
    assert.deepStrictEqual(result, {
      type: "params",
      params: { runId: 22, task: "finish the work" },
    });
  });

  it("parses continue with --agent override", () => {
    const result = parseSubagentToolCommand("subagent continue 22 --agent reviewer -- review this");
    assert.equal(result.type, "params");
    if (result.type === "params") {
      assert.equal(result.params.runId, 22);
      assert.equal(result.params.agent, "reviewer");
      assert.equal(result.params.task, "review this");
    }
  });

  it("parses continue with --agent= syntax", () => {
    const result = parseSubagentToolCommand("subagent continue 22 --agent=reviewer -- review this");
    assert.equal(result.type, "params");
    if (result.type === "params") {
      assert.equal(result.params.agent, "reviewer");
    }
  });

  it("errors on continue without runId", () => {
    const result = parseSubagentToolCommand("subagent continue -- some task");
    assert.equal(result.type, "error");
    assert.ok(result.type === "error" && result.message.includes("requires"));
  });

  it("errors on continue with non-numeric runId", () => {
    const result = parseSubagentToolCommand("subagent continue abc -- task");
    assert.equal(result.type, "error");
    assert.ok(result.type === "error" && result.message.includes("numeric runId"));
  });

  it("errors on continue with --sync flag (deprecated)", () => {
    const result = parseSubagentToolCommand("subagent continue 22 --sync -- task");
    assert.equal(result.type, "error");
    assert.ok(result.type === "error" && result.message.includes("no longer supported"));
    assert.ok(result.type === "error" && result.message.includes("continue"));
  });

  it("errors on continue without -- separator", () => {
    const result = parseSubagentToolCommand("subagent continue 22 task");
    assert.equal(result.type, "error");
    assert.ok(result.type === "error" && result.message.includes("--"));
  });

  // ── batch ──────────────────────────────────────────────────────────────

  it("parses batch with 2 blocks", () => {
    const result = parseSubagentToolCommand(
      'subagent batch --agent worker --task "build A" --agent reviewer --task "review B"',
    );
    assert.deepStrictEqual(result, {
      type: "params",
      params: {
        asyncAction: "batch",
        runs: [
          { agent: "worker", task: "build A" },
          { agent: "reviewer", task: "review B" },
        ],
      },
    });
  });

  it("parses batch with --main context mode", () => {
    const result = parseSubagentToolCommand(
      'subagent batch --main --agent worker --task "A" --agent reviewer --task "B"',
    );
    assert.equal(result.type, "params");
    if (result.type === "params") {
      assert.equal(result.params.contextMode, "main");
      assert.equal(result.params.asyncAction, "batch");
    }
  });

  it("parses batch with --isolated context mode", () => {
    const result = parseSubagentToolCommand(
      'subagent batch --isolated --agent worker --task "A" --agent reviewer --task "B"',
    );
    assert.equal(result.type, "params");
    if (result.type === "params") {
      assert.equal(result.params.contextMode, "isolated");
      assert.equal(result.params.asyncAction, "batch");
    }
  });

  it("errors on batch with only 1 block", () => {
    const result = parseSubagentToolCommand('subagent batch --agent worker --task "A"');
    assert.equal(result.type, "error");
    assert.ok(result.type === "error" && result.message.includes("at least 2"));
  });

  it("errors on batch with --task before --agent", () => {
    const result = parseSubagentToolCommand('subagent batch --task "A" --agent worker');
    assert.equal(result.type, "error");
    assert.ok(result.type === "error" && result.message.includes("--agent"));
  });

  it("errors on batch with missing --task after --agent", () => {
    const result = parseSubagentToolCommand(
      'subagent batch --agent worker --agent reviewer --task "B"',
    );
    assert.equal(result.type, "error");
  });

  it("errors on batch with free text outside blocks", () => {
    const result = parseSubagentToolCommand(
      'subagent batch freetext --agent worker --task "A" --agent reviewer --task "B"',
    );
    assert.equal(result.type, "error");
    assert.ok(result.type === "error" && result.message.includes("free text"));
  });

  // ── chain ──────────────────────────────────────────────────────────────

  it("parses chain with 2 steps", () => {
    const result = parseSubagentToolCommand(
      'subagent chain --agent worker --task "implement" --agent reviewer --task "review"',
    );
    assert.deepStrictEqual(result, {
      type: "params",
      params: {
        asyncAction: "chain",
        steps: [
          { agent: "worker", task: "implement" },
          { agent: "reviewer", task: "review" },
        ],
      },
    });
  });

  it("errors on chain with only 1 step", () => {
    const result = parseSubagentToolCommand('subagent chain --agent worker --task "A"');
    assert.equal(result.type, "error");
    assert.ok(result.type === "error" && result.message.includes("at least 2"));
  });

  it("parses chain with --isolated context", () => {
    const result = parseSubagentToolCommand(
      'subagent chain --isolated --agent worker --task "A" --agent reviewer --task "B"',
    );
    assert.equal(result.type, "params");
    if (result.type === "params") {
      assert.equal(result.params.contextMode, "isolated");
      assert.equal(result.params.asyncAction, "chain");
    }
  });

  // ── abort / remove ─────────────────────────────────────────────────────

  it("parses 'abort <runId>'", () => {
    const result = parseSubagentToolCommand("subagent abort 22");
    assert.deepStrictEqual(result, {
      type: "params",
      params: { asyncAction: "abort", runId: 22 },
    });
  });

  it("parses 'abort' with comma-separated runIds", () => {
    const result = parseSubagentToolCommand("subagent abort 22,23,24");
    assert.deepStrictEqual(result, {
      type: "params",
      params: { asyncAction: "abort", runIds: [22, 23, 24] },
    });
  });

  it("deduplicates comma-separated runIds", () => {
    const result = parseSubagentToolCommand("subagent abort 22,22,23");
    assert.deepStrictEqual(result, {
      type: "params",
      params: { asyncAction: "abort", runIds: [22, 23] },
    });
  });

  it("parses 'abort all' with known runIds", () => {
    const result = parseSubagentToolCommand("subagent abort all", { knownRunIds: [1, 2, 3] });
    assert.deepStrictEqual(result, {
      type: "params",
      params: { asyncAction: "abort", runIds: [1, 2, 3] },
    });
  });

  it("errors on 'abort all' with no known runIds", () => {
    const result = parseSubagentToolCommand("subagent abort all");
    assert.equal(result.type, "error");
  });

  it("errors on abort without target", () => {
    const result = parseSubagentToolCommand("subagent abort");
    assert.equal(result.type, "error");
  });

  it("parses 'remove <runId>'", () => {
    const result = parseSubagentToolCommand("subagent remove 5");
    assert.deepStrictEqual(result, {
      type: "params",
      params: { asyncAction: "remove", runId: 5 },
    });
  });

  it("parses 'remove all' with known runIds", () => {
    const result = parseSubagentToolCommand("subagent remove all", { knownRunIds: [10, 20] });
    assert.deepStrictEqual(result, {
      type: "params",
      params: { asyncAction: "remove", runIds: [10, 20] },
    });
  });

  // ── Edge cases ─────────────────────────────────────────────────────────

  it("errors on non-string command", () => {
    const result = parseSubagentToolCommand(123);
    assert.equal(result.type, "error");
    assert.ok(result.type === "error" && result.message.includes("Missing or invalid"));
  });

  it("errors on null command", () => {
    const result = parseSubagentToolCommand(null);
    assert.equal(result.type, "error");
  });

  it("errors on undefined command", () => {
    const result = parseSubagentToolCommand(undefined);
    assert.equal(result.type, "error");
  });

  it("errors on empty string", () => {
    const result = parseSubagentToolCommand("");
    assert.equal(result.type, "error");
    assert.ok(result.type === "error" && result.message.includes("Empty command"));
  });

  it("errors on whitespace-only string", () => {
    const result = parseSubagentToolCommand("   ");
    assert.equal(result.type, "error");
  });

  it("errors on unclosed quotes", () => {
    const result = parseSubagentToolCommand('subagent run planner -- "unclosed');
    assert.equal(result.type, "error");
    assert.ok(result.type === "error" && result.message.includes("Unclosed quote"));
  });

  it("errors on unknown subcommand", () => {
    const result = parseSubagentToolCommand("subagent foobar");
    assert.equal(result.type, "error");
    assert.ok(result.type === "error" && result.message.includes("Unknown subcommand"));
  });

  it("handles the 'help' verb without 'subagent' prefix", () => {
    const result = parseSubagentToolCommand("help");
    assert.deepStrictEqual(result, { type: "help" });
  });

  it("handles run with quoted task containing spaces", () => {
    const result = parseSubagentToolCommand('subagent run planner -- "build login page with auth"');
    assert.equal(result.type, "params");
    if (result.type === "params") {
      assert.equal(result.params.task, "build login page with auth");
    }
  });

  it("handles escaped characters in task", () => {
    const result = parseSubagentToolCommand("subagent run planner -- hello\\ world");
    assert.equal(result.type, "params");
    if (result.type === "params") {
      assert.equal(result.params.task, "hello world");
    }
  });

  it("trims whitespace from command input", () => {
    const result = parseSubagentToolCommand("  subagent help  ");
    assert.deepStrictEqual(result, { type: "help" });
  });

  it("single comma-separated id collapses to single runId", () => {
    const result = parseSubagentToolCommand("subagent abort 22,22");
    assert.deepStrictEqual(result, {
      type: "params",
      params: { asyncAction: "abort", runId: 22 },
    });
  });

  // ── Additional edge cases for 100% coverage ──────────────────────────

  it("errors on run with extra argument after agent name", () => {
    const result = parseSubagentToolCommand("subagent run planner extra -- task");
    assert.equal(result.type, "error");
    assert.ok(result.type === "error" && result.message.includes("Unexpected argument"));
  });

  it("errors on detail with non-numeric runId", () => {
    const result = parseSubagentToolCommand("subagent detail abc");
    assert.equal(result.type, "error");
    assert.ok(result.type === "error" && result.message.includes("abc"));
  });

  it("errors on batch with unknown --option after blocks start", () => {
    const result = parseSubagentToolCommand("subagent batch --unknown");
    assert.equal(result.type, "error");
    assert.ok(result.type === "error" && result.message.includes("Unknown or misplaced"));
  });

  it("errors on batch with --agent but no value", () => {
    const result = parseSubagentToolCommand("subagent batch --agent");
    assert.equal(result.type, "error");
    assert.ok(result.type === "error" && result.message.includes("--agent <value>"));
  });

  it("errors on batch with --agent followed by another flag", () => {
    const result = parseSubagentToolCommand("subagent batch --agent --task");
    assert.equal(result.type, "error");
    assert.ok(result.type === "error" && result.message.includes("--agent <value>"));
  });

  it("errors on batch with --task value missing", () => {
    const result = parseSubagentToolCommand("subagent batch --agent worker --task");
    assert.equal(result.type, "error");
    assert.ok(result.type === "error" && result.message.includes("--task <value>"));
  });

  it("errors on batch with --task value starting with --", () => {
    const result = parseSubagentToolCommand("subagent batch --agent worker --task --agent");
    assert.equal(result.type, "error");
    assert.ok(result.type === "error" && result.message.includes("--task <value>"));
  });

  it("errors on continue with unknown option", () => {
    const result = parseSubagentToolCommand("subagent continue 22 --verbose -- task");
    assert.equal(result.type, "error");
    assert.ok(result.type === "error" && result.message.includes("Unknown option"));
    assert.ok(result.type === "error" && result.message.includes("--agent"));
  });

  it("errors on continue with unexpected extra arg after runId", () => {
    const result = parseSubagentToolCommand("subagent continue 22 extra -- task");
    assert.equal(result.type, "error");
    assert.ok(result.type === "error" && result.message.includes("Unexpected argument"));
  });

  it("errors on continue with --agent but no value", () => {
    const result = parseSubagentToolCommand("subagent continue 22 --agent -- task");
    assert.equal(result.type, "error");
    assert.ok(result.type === "error" && result.message.includes("--agent requires a value"));
  });

  it("errors on abort with invalid comma-separated ids", () => {
    const result = parseSubagentToolCommand("subagent abort abc,def");
    assert.equal(result.type, "error");
    assert.ok(result.type === "error" && result.message.includes("Invalid"));
  });

  it("errors on abort with invalid non-numeric target", () => {
    const result = parseSubagentToolCommand("subagent abort xyz");
    assert.equal(result.type, "error");
    assert.ok(result.type === "error" && result.message.includes("Invalid"));
  });

  it("handles trailing backslash in tokenizer", () => {
    const result = parseSubagentToolCommand("subagent run planner -- task\\");
    assert.equal(result.type, "params");
    if (result.type === "params") {
      assert.ok((result.params.task as string).endsWith("\\"));
    }
  });

  it("parses chain with --isolated correctly", () => {
    const result = parseSubagentToolCommand(
      'subagent chain --isolated --agent a --task "x" --agent b --task "y"',
    );
    assert.equal(result.type, "params");
    if (result.type === "params") {
      assert.equal(result.params.contextMode, "isolated");
      assert.equal(result.params.asyncAction, "chain");
    }
  });

  it("parses continue with --main and --agent", () => {
    const result = parseSubagentToolCommand(
      "subagent continue 5 --main --agent reviewer -- do review",
    );
    assert.equal(result.type, "params");
    if (result.type === "params") {
      assert.equal(result.params.runId, 5);
      assert.equal(result.params.agent, "reviewer");
      assert.equal(result.params.contextMode, "main");
    }
  });
});

// ━━━ parseSubagentCommandVerb ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("parseSubagentCommandVerb", () => {
  it("returns verb for valid command", () => {
    assert.equal(parseSubagentCommandVerb("subagent run planner -- task"), "run");
  });

  it("returns 'help' for bare 'subagent'", () => {
    assert.equal(parseSubagentCommandVerb("subagent"), "help");
  });

  it("returns verb without 'subagent' prefix", () => {
    assert.equal(parseSubagentCommandVerb("agents"), "agents");
  });

  it("returns null for non-string input", () => {
    assert.equal(parseSubagentCommandVerb(42), null);
  });

  it("returns null for empty string", () => {
    assert.equal(parseSubagentCommandVerb(""), null);
  });

  it("returns null for whitespace", () => {
    assert.equal(parseSubagentCommandVerb("   "), null);
  });

  it("returns null for unclosed quotes", () => {
    assert.equal(parseSubagentCommandVerb('"unclosed'), null);
  });
});

// ━━━ isSubagentAsyncLaunchCommand ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("isSubagentAsyncLaunchCommand", () => {
  it("returns true for run", () => {
    assert.equal(isSubagentAsyncLaunchCommand("subagent run planner -- task"), true);
  });

  it("returns true for continue", () => {
    assert.equal(isSubagentAsyncLaunchCommand("subagent continue 22 -- task"), true);
  });

  it("returns true for batch", () => {
    assert.equal(
      isSubagentAsyncLaunchCommand('subagent batch --agent a --task "x" --agent b --task "y"'),
      true,
    );
  });

  it("returns true for chain", () => {
    assert.equal(
      isSubagentAsyncLaunchCommand('subagent chain --agent a --task "x" --agent b --task "y"'),
      true,
    );
  });

  it("returns false for help", () => {
    assert.equal(isSubagentAsyncLaunchCommand("subagent help"), false);
  });

  it("returns false for runs", () => {
    assert.equal(isSubagentAsyncLaunchCommand("subagent runs"), false);
  });

  it("returns false for status", () => {
    assert.equal(isSubagentAsyncLaunchCommand("subagent status 22"), false);
  });

  it("returns false for abort", () => {
    assert.equal(isSubagentAsyncLaunchCommand("subagent abort 22"), false);
  });

  it("returns false for non-string input", () => {
    assert.equal(isSubagentAsyncLaunchCommand(null), false);
  });

  it("returns false for empty string", () => {
    assert.equal(isSubagentAsyncLaunchCommand(""), false);
  });

  it("returns false for unclosed quotes (tokenizer error)", () => {
    assert.equal(isSubagentAsyncLaunchCommand('"unclosed'), false);
  });

  it("returns false for whitespace-only", () => {
    assert.equal(isSubagentAsyncLaunchCommand("   "), false);
  });
});
