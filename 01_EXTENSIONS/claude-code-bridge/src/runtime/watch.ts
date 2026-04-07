import type { Ctx, PiBridge } from "../core/types.js";
import { getState } from "./store.js";
import { handleConfigChanges } from "./config-change.js";
import { currentWatchedPaths, handleFileChanges } from "./file-change.js";
import { diffSnapshots, scanConfigSnapshot, scanFileSnapshot } from "./watch-scan.js";
import { getConfigSnapshot, getFileSnapshot, setConfigSnapshot, setFileSnapshot, setWatchLoop, stopWatchLoop } from "./watch-store.js";

export async function startWatchLoop(pi: PiBridge, ctx: Ctx) {
	setConfigSnapshot(scanConfigSnapshot(ctx.cwd));
	const state = getState();
	setFileSnapshot(scanFileSnapshot(state?.projectRoot || ctx.cwd, state?.fileWatchBasenames || [], currentWatchedPaths()));
	setWatchLoop(setInterval(() => void tick(pi, ctx), 1000));
}

export function stopBridgeWatchLoop() {
	stopWatchLoop();
}

async function tick(pi: PiBridge, ctx: Ctx) {
	const beforeConfig = getConfigSnapshot();
	const nextConfig = scanConfigSnapshot(ctx.cwd);
	setConfigSnapshot(nextConfig);
	await handleConfigChanges(pi, ctx, diffSnapshots(beforeConfig, nextConfig).map((item) => item.path));
	const state = getState();
	const beforeFile = getFileSnapshot();
	const nextFile = scanFileSnapshot(state?.projectRoot || ctx.cwd, state?.fileWatchBasenames || [], currentWatchedPaths());
	setFileSnapshot(nextFile);
	await handleFileChanges(pi, ctx, diffSnapshots(beforeFile, nextFile).filter((item) => item.event !== "unlink" || beforeFile.get(item.path) !== undefined));
}
