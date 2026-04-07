let timer: NodeJS.Timeout | undefined;
let configSnapshot = new Map<string, string>();
let fileSnapshot = new Map<string, string>();
let userDynamicWatchPaths: string[] = [];
let repoDynamicWatchPaths: string[] = [];

export function stopWatchLoop() {
	if (timer) clearInterval(timer);
	timer = undefined;
}

export function setWatchLoop(next: NodeJS.Timeout) {
	stopWatchLoop();
	timer = next;
}

export function getConfigSnapshot() {
	return configSnapshot;
}

export function setConfigSnapshot(next: Map<string, string>) {
	configSnapshot = next;
}

export function getFileSnapshot() {
	return fileSnapshot;
}

export function setFileSnapshot(next: Map<string, string>) {
	fileSnapshot = next;
}

export function getDynamicWatchPaths() {
	return [...new Set([...userDynamicWatchPaths, ...repoDynamicWatchPaths])];
}

export function setDynamicWatchPaths(next: string[], scope: "user" | "repo") {
	if (scope === "user") userDynamicWatchPaths = [...new Set(next)];
	else repoDynamicWatchPaths = [...new Set(next)];
}

export function clearRepoDynamicWatchPaths() {
	repoDynamicWatchPaths = [];
}

export function clearWatchState() {
	configSnapshot = new Map<string, string>();
	fileSnapshot = new Map<string, string>();
	userDynamicWatchPaths = [];
	repoDynamicWatchPaths = [];
}
