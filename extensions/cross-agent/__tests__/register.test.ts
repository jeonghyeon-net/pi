import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { registerDiscoveredCommands } from "../core/register.js";
import type { SourceGroup } from "../core/types.js";

interface Registered {
  name: string;
  description: string;
  handler: (args: string) => Promise<void> | void;
}

function makeFakePi(): {
  pi: ExtensionAPI;
  registered: Registered[];
  sent: string[];
} {
  const registered: Registered[] = [];
  const sent: string[] = [];
  const pi = {
    registerCommand: (
      name: string,
      opts: { description: string; handler: (args: string) => Promise<void> | void },
    ) => {
      registered.push({ name, description: opts.description, handler: opts.handler });
    },
    sendUserMessage: (msg: string) => {
      sent.push(msg);
    },
  } as unknown as ExtensionAPI;
  return { pi, registered, sent };
}

// ━━━ registerDiscoveredCommands ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("registerDiscoveredCommands", () => {
  it("registers commands from groups with [source] description prefix", () => {
    const { pi, registered } = makeFakePi();
    const groups: SourceGroup[] = [
      {
        source: ".claude",
        commands: [{ name: "greet", description: "hello", content: "Hi $1" }],
        skills: [],
        agents: [],
      },
    ];
    registerDiscoveredCommands(pi, groups);
    assert.equal(registered.length, 1);
    assert.equal(registered[0]?.name, "greet");
    assert.equal(registered[0]?.description, "[.claude] hello");
  });

  it("caps description at 120 chars", () => {
    const { pi, registered } = makeFakePi();
    const longDesc = "x".repeat(200);
    const groups: SourceGroup[] = [
      {
        source: ".claude",
        commands: [{ name: "long", description: longDesc, content: "body" }],
        skills: [],
        agents: [],
      },
    ];
    registerDiscoveredCommands(pi, groups);
    assert.equal(registered[0]?.description.length, 120);
    assert.ok(registered[0]?.description.startsWith("[.claude] xxx"));
  });

  it("keeps description under 120 chars unchanged", () => {
    const { pi, registered } = makeFakePi();
    const groups: SourceGroup[] = [
      {
        source: ".codex",
        commands: [{ name: "short", description: "brief", content: "b" }],
        skills: [],
        agents: [],
      },
    ];
    registerDiscoveredCommands(pi, groups);
    assert.equal(registered[0]?.description, "[.codex] brief");
  });

  it("dedupes by command name across groups (first wins)", () => {
    const { pi, registered } = makeFakePi();
    const groups: SourceGroup[] = [
      {
        source: ".claude",
        commands: [{ name: "dup", description: "first", content: "c1" }],
        skills: [],
        agents: [],
      },
      {
        source: "~/.claude",
        commands: [{ name: "dup", description: "second", content: "c2" }],
        skills: [],
        agents: [],
      },
    ];
    registerDiscoveredCommands(pi, groups);
    assert.equal(registered.length, 1);
    assert.equal(registered[0]?.description, "[.claude] first");
  });

  it("registers unique commands from multiple groups", () => {
    const { pi, registered } = makeFakePi();
    const groups: SourceGroup[] = [
      {
        source: ".claude",
        commands: [{ name: "a", description: "da", content: "ca" }],
        skills: [],
        agents: [],
      },
      {
        source: ".gemini",
        commands: [{ name: "b", description: "db", content: "cb" }],
        skills: [],
        agents: [],
      },
    ];
    registerDiscoveredCommands(pi, groups);
    const names = registered.map((r) => r.name).sort();
    assert.deepStrictEqual(names, ["a", "b"]);
  });

  it("handler sends expanded user message with args", async () => {
    const { pi, registered, sent } = makeFakePi();
    const groups: SourceGroup[] = [
      {
        source: ".claude",
        commands: [{ name: "say", description: "d", content: "Hello $1 and $ARGUMENTS" }],
        skills: [],
        agents: [],
      },
    ];
    registerDiscoveredCommands(pi, groups);
    const handler = registered[0]?.handler;
    assert.ok(handler);
    await handler("foo bar");
    assert.equal(sent.length, 1);
    assert.equal(sent[0], "Hello foo and foo bar");
  });

  it("handler sends template unchanged with empty args", async () => {
    const { pi, registered, sent } = makeFakePi();
    const groups: SourceGroup[] = [
      {
        source: ".claude",
        commands: [{ name: "plain", description: "d", content: "plain template" }],
        skills: [],
        agents: [],
      },
    ];
    registerDiscoveredCommands(pi, groups);
    const handler = registered[0]?.handler;
    assert.ok(handler);
    await handler("");
    assert.equal(sent[0], "plain template");
  });

  it("handler handles undefined-ish falsy args via default empty string", async () => {
    const { pi, registered, sent } = makeFakePi();
    const groups: SourceGroup[] = [
      {
        source: ".claude",
        commands: [{ name: "sub", description: "d", content: "a $ARGUMENTS b" }],
        skills: [],
        agents: [],
      },
    ];
    registerDiscoveredCommands(pi, groups);
    const handler = registered[0]?.handler;
    assert.ok(handler);
    // Pass empty string (falsy) → handler falls back to ""
    await handler("");
    assert.equal(sent[0], "a  b");
  });

  it("does nothing for empty groups array", () => {
    const { pi, registered } = makeFakePi();
    registerDiscoveredCommands(pi, []);
    assert.deepStrictEqual(registered, []);
  });

  it("does nothing when group has no commands", () => {
    const { pi, registered } = makeFakePi();
    const groups: SourceGroup[] = [
      {
        source: ".pi/agents",
        commands: [],
        skills: [],
        agents: [{ name: "a", description: "d", content: "c" }],
      },
    ];
    registerDiscoveredCommands(pi, groups);
    assert.deepStrictEqual(registered, []);
  });
});
