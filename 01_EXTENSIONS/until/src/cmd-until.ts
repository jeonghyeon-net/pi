import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import { parseInterval } from "./interval.js";
import { loadPresets, getPresetCompletions } from "./presets.js";
import { registerTask } from "./register.js";

const PRESETS_DIR = join(dirname(fileURLToPath(import.meta.url)), "../until-presets");

export function createUntilCommand() {
	return {
		description: "조건 충족까지 주기적 실행. 사용법: /until <간격> <프롬프트> 또는 /until <프리셋>",
		getArgumentCompletions: (prefix: string) => {
			const trimmed = prefix.trimStart();
			if (trimmed.includes(" ")) {
				const spaceIdx = trimmed.indexOf(" ");
				const first = trimmed.slice(0, spaceIdx);
				const rest = trimmed.slice(spaceIdx + 1).trimStart();
				if (!parseInterval(first) || rest.includes(" ")) return null;
				return getPresetCompletions(PRESETS_DIR, rest);
			}
			return getPresetCompletions(PRESETS_DIR, trimmed);
		},
		handler: async (args: string, ctx: ExtensionCommandContext) => {
			const raw = args.trim();
			const presets = await loadPresets(PRESETS_DIR);
			const notifyFn = ctx.ui.notify.bind(ctx.ui);
			if (!raw) {
				showHelp(presets, notifyFn);
				return;
			}
			const directPreset = presets[raw.toUpperCase()];
			if (directPreset) {
				registerTask(directPreset.defaultInterval.ms, directPreset.defaultInterval.label, directPreset.prompt, notifyFn);
				return;
			}
			if (!raw.includes(" ") && existsSync(join(PRESETS_DIR, `${raw.toUpperCase()}.md`))) {
				notifyFn(`프리셋 "${raw.toUpperCase()}" 파일은 있지만 로드에 실패했어.\nfrontmatter를 확인해줘.`, "error");
				return;
			}
			const spaceIdx = raw.indexOf(" ");
			if (spaceIdx === -1) {
				notifyFn("프롬프트가 필요해. 예: /until 5m PR 코멘트 확인해줘\n프리셋: /until PR", "error");
				return;
			}
			handleIntervalArgs(raw, spaceIdx, presets, notifyFn);
		},
	};
}

function handleIntervalArgs(
	raw: string,
	spaceIdx: number,
	presets: Record<string, { defaultInterval: { ms: number; label: string }; prompt: string }>,
	notifyFn: (m: string, type?: "info" | "warning" | "error") => void,
) {
	const firstToken = raw.slice(0, spaceIdx);
	const rest = raw.slice(spaceIdx + 1).trim();
	const parsed = parseInterval(firstToken);
	if (!parsed) {
		notifyFn(`인터벌 "${firstToken}"을 파싱할 수 없어.\n지원: 5m, 1h, 5분, 1시간, 5분마다`, "error");
		return;
	}
	const restPreset = presets[rest.toUpperCase()];
	if (restPreset) {
		registerTask(parsed.ms, parsed.label, restPreset.prompt, notifyFn);
		return;
	}
	registerTask(parsed.ms, parsed.label, rest, notifyFn);
}

function showHelp(
	presets: Record<string, { description: string; defaultInterval: { label: string } }>,
	notifyFn: (m: string, type?: "info" | "warning" | "error") => void,
) {
	const list = Object.entries(presets)
		.map(([k, p]) => `  ${k} — ${p.description} (기본 ${p.defaultInterval.label})`)
		.join("\n");
	const help = list ? `\n\n프리셋:\n${list}\n예: /until PR  또는  /until 10m PR` : "";
	notifyFn(`사용법: /until <간격> <프롬프트>\n예: /until 5m PR 코멘트 확인해줘${help}`, "warning");
}
