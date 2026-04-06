import { formatUsage } from "./format.js";
import { parseCommand } from "./cli.js";
export function buildCallText(params) {
    try {
        const cmd = parseCommand(params.command);
        if (cmd.type === "run")
            return `▶ ${cmd.agent}: ${cmd.task}`;
        if (cmd.type === "batch")
            return `▶ batch (${cmd.items.length} tasks)`;
        if (cmd.type === "chain")
            return `▶ chain (${cmd.steps.length} steps)`;
        if (cmd.type === "continue")
            return `▶ continue #${cmd.id}: ${cmd.task}`;
        if (cmd.type === "abort")
            return `▶ abort #${cmd.id}`;
        if (cmd.type === "detail")
            return `▶ detail #${cmd.id}`;
        return `▶ ${params.command}`;
    }
    catch {
        return `▶ ${params.command}`;
    }
}
export function buildResultText(result) {
    const header = `${result.agent} #${result.id}`;
    if (result.error)
        return `✗ ${header} error: ${result.error}`;
    if (result.escalation)
        return `⚠ ${header} needs your input:\n${result.escalation}\n\nUse: subagent continue ${result.id} -- <your answer>`;
    return `✓ ${header}\n${result.output}\n\n${formatUsage(result.usage)}`;
}
