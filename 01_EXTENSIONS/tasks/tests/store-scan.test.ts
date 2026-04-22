import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readTaskSnapshots, resolveTaskStorePath } from "../src/store-scan.ts";
import { tempDir } from "./helpers.ts";

const env = process.env.PI_TASKS;
const home = process.env.HOME;
afterEach(() => { process.env.PI_TASKS = env; process.env.HOME = home; });

describe("task store scanning", () => {
  it("resolves session, project, relative, named, and off paths", () => {
    const cwd = tempDir();
    expect(resolveTaskStorePath({ cwd })).toBeUndefined();
    expect(resolveTaskStorePath({ cwd, sessionManager: { getSessionId: () => "abc" } })).toBe(join(cwd, ".pi", "tasks", "tasks-abc.json"));
    mkdirSync(join(cwd, ".pi"), { recursive: true });
    writeFileSync(join(cwd, ".pi", "tasks-config.json"), JSON.stringify({ taskScope: "project" }));
    expect(resolveTaskStorePath({ cwd })).toBe(join(cwd, ".pi", "tasks", "tasks.json"));
    writeFileSync(join(cwd, ".pi", "tasks-config.json"), JSON.stringify({ other: true }));
    expect(resolveTaskStorePath({ cwd, sessionManager: { getSessionId: () => "fallback" } })).toBe(join(cwd, ".pi", "tasks", "tasks-fallback.json"));
    process.env.PI_TASKS = "/tmp/shared.json";
    expect(resolveTaskStorePath({ cwd })).toBe("/tmp/shared.json");
    process.env.PI_TASKS = "./custom.json";
    expect(resolveTaskStorePath({ cwd })).toBe(join(cwd, "custom.json"));
    process.env.PI_TASKS = "shared-list";
    process.env.HOME = tempDir();
    expect(resolveTaskStorePath({ cwd })).toBe(join(process.env.HOME, ".pi", "tasks", "shared-list.json"));
    process.env.PI_TASKS = "off";
    expect(resolveTaskStorePath({ cwd })).toBeUndefined();
    writeFileSync(join(cwd, ".pi", "tasks-config.json"), JSON.stringify({ taskScope: "memory" }));
    delete process.env.PI_TASKS;
    expect(resolveTaskStorePath({ cwd, sessionManager: { getSessionId: () => "abc" } })).toBeUndefined();
  });

  it("loads snapshots and tolerates missing or invalid files", () => {
    delete process.env.PI_TASKS;
    const cwd = tempDir();
    expect(readTaskSnapshots({ cwd, sessionManager: { getSessionId: () => "x" } })).toEqual([]);
    const dir = join(cwd, ".pi", "tasks");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "tasks-x.json"), JSON.stringify({ tasks: [{ id: "4", metadata: { agentId: "agent-4" } }] }));
    expect(readTaskSnapshots({ cwd, sessionManager: { getSessionId: () => "x" } })[0]?.id).toBe("4");
    writeFileSync(join(dir, "tasks-x.json"), JSON.stringify({ tasks: {} }));
    expect(readTaskSnapshots({ cwd, sessionManager: { getSessionId: () => "x" } })).toEqual([]);
    writeFileSync(join(dir, "tasks-x.json"), "{bad json");
    expect(readTaskSnapshots({ cwd, sessionManager: { getSessionId: () => "x" } })).toEqual([]);
  });
});
