import { completeSimple } from "@mariozechner/pi-ai";
import { DefaultResourceLoader, SessionManager, createAgentSession, createBashTool, createFindTool, createGrepTool, createReadTool } from "@mariozechner/pi-coding-agent";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Ctx, EventName, HookDef, HookRunResult } from "../core/types.js";

export async function runVerifierHook(handler: HookDef, input: any, ctx: Ctx): Promise<HookRunResult> {
	const model = resolveModel(handler.model, ctx);
	if (!model) return { code: 1, stdout: "", stderr: `No model available for ${handler.type} hook.` };
	const prompt = buildPrompt(handler, input);
	return handler.type === "prompt" ? await runPrompt(handler, prompt, model, ctx) : await runAgent(handler, prompt, model, ctx);
}

function resolveModel(modelName: string | undefined, ctx: Ctx) {
	if (!modelName) return ctx.model;
	const [provider, modelId] = modelName.includes("/") ? modelName.split("/", 2) : modelName.split(":", 2);
	return provider && modelId ? ctx.modelRegistry.find(provider, modelId) : ctx.model;
}

function buildPrompt(handler: HookDef, input: any) {
	const args = JSON.stringify(input, null, 2);
	const body = handler.prompt?.includes("$ARGUMENTS") ? handler.prompt.replaceAll("$ARGUMENTS", args) : `${handler.prompt}\n\nHook input JSON:\n${args}`;
	return `${body}\n\nReturn ONLY valid JSON matching {"ok":boolean,"reason"?:string}. Set ok=false only when this event should be blocked.`;
}

async function runPrompt(handler: HookDef, prompt: string, model: any, ctx: Ctx): Promise<HookRunResult> {
	const auth = await ctx.modelRegistry.getApiKeyAndHeaders(model);
	if (!auth.ok) return { code: 1, stdout: "", stderr: auth.error };
	const controller = new AbortController();
	try {
		const message = await withTimeout(completeSimple(model, { messages: [{ role: "user", content: prompt, timestamp: Date.now() }] }, { apiKey: auth.apiKey, headers: auth.headers, signal: controller.signal }), handler.timeoutSeconds * 1000, () => controller.abort());
		return mapVerifierResult(handler.eventName, message.content.filter((item) => item.type === "text").map((item) => item.text).join("\n"));
	} catch (error: any) {
		return { code: 1, stdout: "", stderr: error?.message || String(error) };
	}
}

async function runAgent(handler: HookDef, prompt: string, model: any, ctx: Ctx): Promise<HookRunResult> {
	const agentDir = await mkdtemp(join(tmpdir(), "pi-claude-hook-"));
	const loader = new DefaultResourceLoader({ cwd: ctx.cwd, agentDir, noExtensions: true, noSkills: true, noPromptTemplates: true, noThemes: true, agentsFilesOverride: () => ({ agentsFiles: [] }), systemPromptOverride: () => "You are a verification agent. Use tools only when needed and answer with JSON only." });
	await loader.reload();
	const { session } = await createAgentSession({ cwd: ctx.cwd, model, modelRegistry: ctx.modelRegistry, resourceLoader: loader, sessionManager: SessionManager.inMemory(), tools: [createReadTool(ctx.cwd), createBashTool(ctx.cwd), createGrepTool(ctx.cwd), createFindTool(ctx.cwd)] });
	try {
		await withTimeout(session.prompt(prompt), handler.timeoutSeconds * 1000, () => void session.abort());
		const last = session.messages.filter((item) => item.role === "assistant").at(-1);
		return mapVerifierResult(handler.eventName, last ? last.content.filter((item) => item.type === "text").map((item) => item.text).join("\n") : "");
	} catch (error: any) {
		return { code: 1, stdout: "", stderr: error?.message || String(error) };
	} finally {
		session.dispose();
		await rm(agentDir, { recursive: true, force: true });
	}
}

function mapVerifierResult(eventName: EventName, raw: string): HookRunResult {
	const parsed = parseJson(raw);
	if (!parsed || typeof parsed.ok !== "boolean") return { code: 1, stdout: raw, stderr: "Verifier hook did not return valid JSON." };
	if (parsed.ok) return { code: 0, stdout: raw, stderr: "", parsedJson: {} };
	return eventName === "PreToolUse" ? { code: 0, stdout: raw, stderr: "", parsedJson: { hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: parsed.reason || "Denied by Claude verifier hook" } } } : { code: 0, stdout: raw, stderr: "", parsedJson: { decision: "block", reason: parsed.reason || "Blocked by Claude verifier hook" } };
}

function parseJson(raw: string) {
	try { return JSON.parse(raw.trim()); } catch { return undefined; }
}

function withTimeout<T>(promise: Promise<T>, ms: number, onTimeout: () => void) {
	return new Promise<T>((resolve, reject) => {
		const timer = setTimeout(() => { onTimeout(); reject(new Error(`Hook timed out after ${Math.ceil(ms / 1000)}s`)); }, ms);
		void promise.then((value) => (clearTimeout(timer), resolve(value)), (error) => (clearTimeout(timer), reject(error)));
	});
}
