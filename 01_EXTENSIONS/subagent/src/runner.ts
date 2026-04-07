export interface BuildArgsInput {
	base: string[];
	model?: string;
	thinking?: string;
	tools?: string[];
	systemPromptPath: string;
	task: string;
	sessionPath?: string;
}

export { buildMissingOutputDiagnostic, collectOutput } from "./runner-output.js";
export type { CollectedOutput } from "./runner-output.js";

export function getPiCommand(execPath: string, argv1: string, exists: (p: string) => boolean) {
	return argv1 && exists(argv1) ? { cmd: execPath, base: [argv1] } : { cmd: "pi", base: [] };
}

export function buildArgs(input: BuildArgsInput): string[] {
	const args = [...input.base, "--mode", "json", "-p", ...(input.sessionPath ? ["--session", input.sessionPath] : ["--no-session"])] ;
	if (input.model) args.push("--model", input.model);
	if (input.thinking) args.push("--thinking", input.thinking);
	if (input.tools) args.push("--tools", input.tools.join(","));
	args.push("--append-system-prompt", input.systemPromptPath, `Task: ${input.task}`);
	return args;
}
