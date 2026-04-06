import { ESCALATION_MARKER } from "./constants.js";
export function getPiCommand(execPath, argv1, exists) {
    if (argv1 && exists(argv1))
        return { cmd: execPath, base: [argv1] };
    return { cmd: "pi", base: [] };
}
export function buildArgs(input) {
    const args = [...input.base, "--mode", "json", "-p"];
    if (input.sessionPath) {
        args.push("--session", input.sessionPath);
    }
    else {
        args.push("--no-session");
    }
    if (input.model) {
        args.push("--model", input.model);
    }
    if (input.thinking) {
        args.push("--thinking", input.thinking);
    }
    if (input.tools) {
        args.push("--tools", input.tools.join(","));
    }
    args.push("--append-system-prompt", input.systemPromptPath);
    args.push(`Task: ${input.task}`);
    return args;
}
export function collectOutput(events) {
    const texts = [];
    const usage = { inputTokens: 0, outputTokens: 0, turns: 0 };
    for (const evt of events) {
        if (evt.type === "message" && evt.text) {
            texts.push(evt.text);
            usage.inputTokens += evt.usage?.inputTokens ?? 0;
            usage.outputTokens += evt.usage?.outputTokens ?? 0;
            usage.turns += evt.usage?.turns ?? 0;
        }
    }
    const output = texts.join("\n");
    const escalation = output.includes(ESCALATION_MARKER)
        ? output.split(ESCALATION_MARKER)[1]?.trim()
        : undefined;
    return { output, usage, escalation };
}
