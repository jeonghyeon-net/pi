import { loadGlobalState } from "./config.js";
import { DEFAULT_ENABLED, STYLE_PROMPT, STYLE_SECTION } from "./constants.js";
import { isEnabled, setEnabled } from "./state.js";

interface BeforeAgentStartEventLike {
	systemPrompt: string;
}

export function onRestore(loadState: () => Promise<boolean> = loadGlobalState) {
	return async () => {
		try {
			setEnabled(await loadState());
		} catch {
			setEnabled(DEFAULT_ENABLED);
		}
	};
}

export function onBeforeAgentStart() {
	return async (event: BeforeAgentStartEventLike) => {
		if (!isEnabled()) return undefined;
		return {
			systemPrompt: `${event.systemPrompt}\n\n${STYLE_SECTION}\n${STYLE_PROMPT}`,
		};
	};
}
