import { spawn } from "node:child_process";
import type { BridgeState, Ctx, HookDef, HookRunResult } from "../core/types.js";
import { runVerifierHook } from "./llm.js";

export async function runHook(handler: HookDef, input: any, state: BridgeState, cwd: string, ctx: Ctx): Promise<HookRunResult> {
	if (handler.type === "prompt" || handler.type === "agent") return await runVerifierHook(handler, input, ctx);
	return handler.type === "command" ? await runCommandHook(handler, input, state, cwd) : await runHttpHook(handler, input, state);
}

function parseHookJson(text: string) {
	const trimmed = text.trim();
	if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) return undefined;
	try { return JSON.parse(trimmed); } catch { return undefined; }
}

async function runCommandHook(handler: HookDef, input: any, state: BridgeState, cwd: string): Promise<HookRunResult> {
	const child = spawn(process.env.SHELL || "/bin/bash", ["-lc", handler.command || ""], { cwd, env: { ...process.env, ...state.mergedEnv, CLAUDE_PROJECT_DIR: state.projectRoot, CLAUDE_ENV_FILE: state.envFilePath || "" }, stdio: ["pipe", "pipe", "pipe"] });
	return await new Promise((done) => {
		let stdout = "";
		let stderr = "";
		let settled = false;
		const finish = (code: number) => settled ? undefined : (settled = true, done({ code, stdout, stderr, parsedJson: parseHookJson(stdout) }));
		const timer = setTimeout(() => { stderr += `Hook timed out after ${handler.timeoutSeconds}s`; child.kill("SIGTERM"); finish(1); }, handler.timeoutSeconds * 1000);
		child.stdout.on("data", (chunk: Buffer) => (stdout += String(chunk)));
		child.stderr.on("data", (chunk: Buffer) => (stderr += String(chunk)));
		child.on("error", (error: Error) => { clearTimeout(timer); stderr += error.message; finish(1); });
		child.on("close", (code: number | null) => { clearTimeout(timer); finish(code ?? 1); });
		child.stdin.write(JSON.stringify(input));
		child.stdin.end();
	});
}

async function runHttpHook(handler: HookDef, input: any, state: BridgeState): Promise<HookRunResult> {
	if (!urlAllowed(handler.url || "", state.allowedHttpHookUrls)) return { code: 1, stdout: "", stderr: "HTTP hook blocked by allowedHttpHookUrls." };
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), handler.timeoutSeconds * 1000);
	try {
		const response = await fetch(handler.url || "", { method: "POST", headers: { "Content-Type": "application/json", ...(interpolateHeaders(handler.headers, handler.allowedEnvVars, state.httpHookAllowedEnvVars, state.mergedEnv) || {}) }, body: JSON.stringify(input), signal: controller.signal });
		const text = await response.text();
		clearTimeout(timer);
		return { code: response.ok ? 0 : 1, stdout: text, stderr: response.ok ? "" : `HTTP ${response.status}`, parsedJson: parseHookJson(text) };
	} catch (error: any) {
		clearTimeout(timer);
		return { code: 1, stdout: "", stderr: error?.message || String(error) };
	}
}

export function interpolateHeaders(headers: Record<string, string> | undefined, allowedEnvVars: string[] | undefined, globalAllowlist: string[] | undefined, mergedEnv: Record<string, string> = {}) {
	if (!headers) return undefined;
	const allowed = new Set(globalAllowlist ? (allowedEnvVars || []).filter((name) => globalAllowlist.includes(name)) : allowedEnvVars || []);
	const env = { ...process.env, ...mergedEnv };
	return Object.fromEntries(Object.entries(headers).map(([key, value]) => [key, value.replace(/\$\{?([A-Za-z_][A-Za-z0-9_]*)\}?/g, (_match, name: string) => allowed.has(name) ? env[name] || "" : "")])) as Record<string, string>;
}

export function urlAllowed(url: string, patterns: string[] | undefined) {
	if (!patterns) return true;
	return patterns.some((pattern) => new RegExp(`^${pattern.replace(/[|\\{}()[\]^$+?.]/g, "\\$&").replace(/\*/g, ".*")}$`).test(url));
}
