import { writeFileSync, existsSync, mkdirSync } from "fs";
import { tmpdir } from "os";
import { dirname, join } from "path";
import { extractMainContext, type Entry } from "./context.js";
import { DEFAULT_HARD_TIMEOUT_MS, DEFAULT_IDLE_TIMEOUT_MS, MAX_RETRIES, RETRY_BASE_MS } from "./constants.js";
import { getPiCommand, buildArgs } from "./runner.js";
import { registerRun, unregisterRun, makeOnEvent } from "./run-progress.js";
import { withRetry } from "./retry.js";
import { addToHistory, sessionPath } from "./session.js";
import { spawnAndCollect } from "./spawn.js";
import { nextId } from "./store.js";
import type { AgentConfig, RunResult, SubagentToolDetails } from "./types.js";
import type { AgentToolUpdateCallback } from "@mariozechner/pi-coding-agent";

export interface DispatchCtx { hasUI: boolean; ui: { setWidget(k: string, v: unknown, o?: unknown): void }; sessionManager: { getBranch(): unknown[] } }
export const errorMsg = (e: unknown) => e instanceof Error ? e.message : String(e);
type OnUpdate = AgentToolUpdateCallback<SubagentToolDetails> | undefined;

export const createRunner = (main: boolean, ctx: DispatchCtx, onUpdate?: OnUpdate, outerSignal?: AbortSignal) => async (agent: AgentConfig, task: string) => {
	const id = nextId();
	return runAgent({ id, agent, task, ctx, onUpdate, outerSignal, sessionFile: sessionPath(id), prompt: buildPrompt(agent, ctx, main) });
};

export const createSessionRunner = (sessFile: string, ctx: DispatchCtx, onUpdate?: OnUpdate, outerSignal?: AbortSignal) => async (agent: AgentConfig, task: string) => {
	const id = nextId();
	return runAgent({ id, agent, task, ctx, onUpdate, outerSignal, sessionFile: sessFile });
};

async function runAgent(input: {
	id: number;
	agent: AgentConfig;
	task: string;
	ctx: DispatchCtx;
	onUpdate?: OnUpdate;
	outerSignal?: AbortSignal;
	sessionFile: string;
	prompt?: string;
}): Promise<RunResult> {
	const id = input.id;
	if (input.prompt) writeFileSync(join(tmpdir(), `pi-sub-${input.agent.name}-${id}.md`), input.prompt);
	ensureSessionDir(input.sessionFile);
	const { cmd, args } = buildRunCommand(input.agent, input.task, input.sessionFile, input.prompt, id);
	const ac = new AbortController();
	const events: Parameters<typeof addToHistory>[0]["events"] = [];
	const abortFromOuter = () => ac.abort();
	let removeOuterAbortListener = () => {};
	if (input.outerSignal) {
		const outerSignal = input.outerSignal;
		removeOuterAbortListener = () => outerSignal.removeEventListener("abort", abortFromOuter);
		if (outerSignal.aborted) ac.abort();
		else outerSignal.addEventListener("abort", abortFromOuter, { once: true });
	}
	registerRun(id, input.agent.name, input.task, input.ctx, ac);
	const onEvent = makeOnEvent(id, input.agent.name, input.task, input.ctx, events, input.onUpdate);
	let result: RunResult | undefined;
	let failed = false;
	let failure: unknown;
	try {
		result = await withRetry(
			() => spawnAndCollect(cmd, args, id, input.agent.name, ac.signal, onEvent, {
				hardTimeoutMs: DEFAULT_HARD_TIMEOUT_MS,
				idleTimeoutMs: DEFAULT_IDLE_TIMEOUT_MS,
			}),
			MAX_RETRIES,
			RETRY_BASE_MS,
		);
	} catch (e) {
		failed = true;
		failure = e;
	}
	removeOuterAbortListener();
	if (failed) return failRun(failure, id, input.agent.name, input.task, input.sessionFile, events);
	return finishRun({ ...result!, task: input.task }, input.sessionFile, events);
}

function buildPrompt(agent: AgentConfig, ctx: DispatchCtx, main: boolean) {
	if (!main) return agent.systemPrompt;
	const summary = extractMainContext(ctx.sessionManager.getBranch() as Entry[], 20);
	return summary ? `${agent.systemPrompt}\n\n[Main Context]\n${summary}` : agent.systemPrompt;
}

function buildRunCommand(agent: AgentConfig, task: string, sessionFile: string, prompt: string | undefined, id: number) {
	const { cmd, base } = getPiCommand(process.execPath, process.argv[1], existsSync);
	const promptPath = prompt ? join(tmpdir(), `pi-sub-${agent.name}-${id}.md`) : "";
	const args = buildArgs({ base, model: agent.model, thinking: agent.thinking, tools: agent.tools, systemPromptPath: promptPath, task, sessionPath: sessionFile });
	if (!prompt) args.splice(args.indexOf("--append-system-prompt"), 2);
	return { cmd, args };
}

function ensureSessionDir(file: string) {
	const dir = dirname(file);
	if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function finishRun(result: RunResult, sessionFile: string, events: NonNullable<Parameters<typeof addToHistory>[0]["events"]>) {
	addToHistory({ id: result.id, agent: result.agent, task: result.task, output: result.output, error: result.error, sessionFile, events });
	unregisterRun(result.id);
	return result;
}

function failRun(e: unknown, id: number, agent: string, task: string, sessionFile: string, events: NonNullable<Parameters<typeof addToHistory>[0]["events"]>): never {
	addToHistory({ id, agent, task, output: "", error: errorMsg(e), sessionFile, events });
	unregisterRun(id);
	throw e;
}
