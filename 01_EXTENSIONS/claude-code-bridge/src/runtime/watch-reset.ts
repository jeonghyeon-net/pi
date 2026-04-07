import { scanFileSnapshot } from "./watch-scan.js";
import { clearRepoDynamicWatchPaths, getDynamicWatchPaths, setFileSnapshot } from "./watch-store.js";

export function clearDynamicWatchPaths(projectRoot: string, basenames: string[]) {
	clearRepoDynamicWatchPaths();
	setFileSnapshot(scanFileSnapshot(projectRoot, basenames, getDynamicWatchPaths()));
}
