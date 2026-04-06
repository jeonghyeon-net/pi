import { loadAgentsFromDir } from "./agents.js";
import { readdirSync, readFileSync, existsSync } from "fs";

function buildHelpText(agentsDir: string): string {
	const agents = existsSync(agentsDir)
		? loadAgentsFromDir(agentsDir, (d) => readdirSync(d).map(String), readFileSync as (p: string, e: string) => string)
		: [];
	const lines = [
		"subagent — 서브에이전트 오케스트레이션",
		"",
		"사용법:",
		"  /sub run <agent> [--main] -- <task>    에이전트 실행",
		"  /sub batch --agent <a> --task <t> ...  병렬 실행",
		"  /sub chain --agent <a> --task <t> ...  순차 실행",
		"  /sub continue <id> -- <task>           세션 이어하기",
		"  /sub abort <id>                        실행 중단",
		"  /sub detail <id>                       상세 히스토리",
		"  /sub runs                              실행 목록",
		"",
		"에이전트:",
		...agents.map((a) => `  ${a.name.padEnd(18)} ${a.description}`),
	];
	return lines.join("\n");
}

interface CommandCtx { ui: { notify(msg: string, type?: string): void } }

export function buildSubCommand(agentsDir: string) {
	return {
		description: "서브에이전트 명령 (run, batch, chain, continue, abort, detail, runs)",
		handler: async (_args: string, ctx: CommandCtx) => {
			ctx.ui.notify(buildHelpText(agentsDir), "info");
		},
	};
}
