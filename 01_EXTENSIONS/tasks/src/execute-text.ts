const LAUNCH_RE = /^#(\d+)\s+→\s+agent\s+(\S+)$/;

type LaunchMap = Map<string, string>;
type Launch = { taskId: string; agentId: string };

function launchesOf(text: string): Launch[] {
  return text.split("\n").flatMap((line) => {
    const match = line.match(LAUNCH_RE);
    return match ? [{ taskId: match[1]!, agentId: match[2]! }] : [];
  });
}

export function rememberLaunchedTasks(text: string, launches: LaunchMap): void {
  for (const launch of launchesOf(text)) launches.set(launch.agentId, launch.taskId);
}

export function rewriteExecuteMessage(text: string): string {
  const launches = launchesOf(text);
  if (launches.length === 0) return text;
  const skipped = text.split("\n\n").find((block) => block.startsWith("Skipped:"));
  const body = launches.map(({ taskId, agentId }) => (
    `- task_id=${taskId} (stable), agent_id=${agentId} (runtime)`
  )).join("\n");
  const lines = [
    `Launched ${launches.length} agent(s):`,
    body,
    "Use TaskOutput with the stable task_id (recommended) or the runtime agent_id above. Both remain valid after completion in this session.",
  ];
  if (skipped) lines.push(skipped);
  return lines.join("\n\n");
}
