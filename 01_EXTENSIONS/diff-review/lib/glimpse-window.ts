import { type ChildProcessWithoutNullStreams, spawn, spawnSync } from "node:child_process";
import { EventEmitter } from "node:events";
import { chmodSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import type { GlimpseOpenOptions } from "glimpseui";

interface NativeHostInfo { path: string; extraArgs?: string[]; buildHint?: string }
interface GlimpseMessage { type?: string; data?: unknown }
const here = dirname(fileURLToPath(import.meta.url));

function tryBuildMacHost(sourcePath: string, targetPath: string): boolean {
	if (process.platform !== "darwin" || !existsSync(sourcePath)) return false;
	const result = spawnSync("swiftc", ["-O", sourcePath, "-o", targetPath], { stdio: "ignore" });
	if (result.status !== 0 || !existsSync(targetPath)) return false;
	chmodSync(targetPath, 0o755);
	return true;
}

function resolveFallbackHost(host: NativeHostInfo): NativeHostInfo {
	if (existsSync(host.path) || host.extraArgs?.length) return host;
	const fileName = process.platform === "win32" ? "glimpse.exe" : "glimpse";
	const packageDir = join(here, "..", "node_modules", "glimpseui", "src");
	const packageHost = join(packageDir, fileName);
	const packageSource = join(packageDir, "glimpse.swift");
	if ((existsSync(packageHost) || tryBuildMacHost(packageSource, packageHost)) && process.platform !== "win32") chmodSync(packageHost, 0o755);
	return existsSync(packageHost) ? { ...host, path: packageHost } : host;
}

export interface QuietGlimpseWindow {
	on(event: "message", listener: (data: unknown) => void): this;
	on(event: "closed", listener: () => void): this;
	on(event: "error", listener: (error: Error) => void): this;
	removeListener(event: "message", listener: (data: unknown) => void): this;
	removeListener(event: "closed", listener: () => void): this;
	removeListener(event: "error", listener: (error: Error) => void): this;
	send(js: string): void;
	close(): void;
}

class QuietWindow extends EventEmitter implements QuietGlimpseWindow {
	#proc: ChildProcessWithoutNullStreams;
	#closed = false;
	constructor(proc: ChildProcessWithoutNullStreams, html: string) {
		super();
		this.#proc = proc;
		createInterface({ input: proc.stdout, crlfDelay: Infinity }).on("line", (line) => this.#onLine(line, html));
		proc.on("error", (error) => this.emit("error", error));
		proc.on("exit", () => this.#markClosed());
	}
	#onLine(line: string, html: string): void {
		let message: GlimpseMessage;
		try { message = JSON.parse(line) as GlimpseMessage; } catch { return void this.emit("error", new Error(`Malformed glimpse line: ${line}`)); }
		if (message.type === "ready") return void this.#write({ type: "html", html: Buffer.from(html).toString("base64") });
		if (message.type === "message") this.emit("message", message.data);
		if (message.type === "closed") this.#markClosed();
	}
	#markClosed(): void { if (!this.#closed) { this.#closed = true; this.emit("closed"); } }
	#write(payload: Record<string, unknown>): void { if (!this.#closed) this.#proc.stdin.write(`${JSON.stringify(payload)}\n`); }
	send(js: string): void { this.#write({ type: "eval", js }); }
	close(): void { this.#write({ type: "close" }); }
}

async function getNativeHost(): Promise<NativeHostInfo> {
	return ((await import("glimpseui")) as { getNativeHostInfo: () => NativeHostInfo }).getNativeHostInfo();
}

export async function openQuietGlimpse(html: string, options: GlimpseOpenOptions = {}): Promise<QuietGlimpseWindow> {
	const host = resolveFallbackHost(await getNativeHost());
	if (!existsSync(host.path) && !host.extraArgs?.length) throw new Error(`Glimpse host not found at '${host.path}'.${host.buildHint ? ` ${host.buildHint}` : ""}`);
	const args = [options.width && `--width=${options.width}`, options.height && `--height=${options.height}`, options.title && "--title", options.title].filter((value): value is string => typeof value === "string");
	return new QuietWindow(spawn(host.path, [...(host.extraArgs ?? []), ...args], { stdio: ["pipe", "pipe", "pipe"], windowsHide: process.platform === "win32", env: { ...process.env, OS_ACTIVITY_MODE: process.env.OS_ACTIVITY_MODE ?? "disable" } }), html);
}
