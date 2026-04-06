import yargsParser from "yargs-parser";
function toArray(val) {
    if (Array.isArray(val))
        return val.map(String);
    if (val !== undefined)
        return [String(val)];
    return [];
}
function zipAgentTask(argv) {
    const agents = toArray(argv.agent);
    const tasks = toArray(argv.task);
    return agents.map((a, i) => ({ agent: a, task: tasks[i] ?? "" }));
}
export function parseCommand(command) {
    const [head, ...rest] = command.split(" -- ");
    const task = rest.join(" -- ").trim();
    const argv = yargsParser(head);
    const sub = String(argv._[0] ?? "");
    switch (sub) {
        case "run":
            return { type: "run", agent: String(argv._[1] ?? ""), task, main: Boolean(argv.main), cwd: argv.cwd ? String(argv.cwd) : undefined };
        case "batch":
            return { type: "batch", items: zipAgentTask(argv), main: Boolean(argv.main) };
        case "chain":
            return { type: "chain", steps: zipAgentTask(argv), main: Boolean(argv.main) };
        case "continue":
            return { type: "continue", id: Number(argv._[1]), task };
        case "abort":
            return { type: "abort", id: Number(argv._[1]) };
        case "detail":
            return { type: "detail", id: Number(argv._[1]) };
        case "runs":
            return { type: "runs" };
        default:
            throw new Error(`Unknown subcommand: ${sub}`);
    }
}
