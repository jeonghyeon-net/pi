import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { CUSTOM_TYPE } from "./constants.js";
import { parseInterval } from "./interval.js";
import { getPresetCompletions, loadPresets, presetFileExists } from "./presets.js";
import type { TaskManager } from "./tasks.js";
import { formatKoreanDuration } from "./time.js";

export function registerTool(pi: ExtensionAPI, tm: TaskManager): void {
  pi.registerTool({
    name: "until_report",
    label: "Until Report",
    description:
      "until 반복 작업의 결과를 보고합니다. 조건 충족 시 done: true로 반복을 종료합니다.",
    promptSnippet: "Report until-loop result: done (condition met?) + summary",
    promptGuidelines: [
      "until 반복 작업 프롬프트를 받으면, 작업 수행 후 반드시 until_report를 호출하세요.",
    ],
    parameters: Type.Object({
      taskId: Type.Number({ description: "until task ID (프롬프트의 #N)" }),
      done: Type.Boolean({ description: "조건이 충족되었으면 true, 아니면 false" }),
      summary: Type.String({ description: "현재 상태를 한 줄로 요약" }),
    }),
    async execute(_toolCallId, params) {
      const result = tm.handleReport(params.taskId, params.done, params.summary);
      return {
        content: [{ type: "text" as const, text: result.text }],
        details: {
          done: result.done,
          summary: result.summary,
          taskId: result.taskId,
          runCount: result.runCount,
          ...(result.nextRunAt !== undefined ? { nextRunAt: result.nextRunAt } : {}),
        },
      };
    },
  });
}

export function registerCommands(pi: ExtensionAPI, tm: TaskManager): void {
  pi.registerCommand("until", {
    description:
      "조건 충족까지 주기적 실행. 사용법: /until <간격> <프롬프트> 또는 /until <프리셋>  예: /until PR",
    getArgumentCompletions: (prefix) => {
      const trimmed = prefix.trimStart();
      if (trimmed.includes(" ")) {
        const spaceIdx = trimmed.indexOf(" ");
        const firstToken = trimmed.slice(0, spaceIdx);
        const rest = trimmed.slice(spaceIdx + 1).trimStart();
        if (!parseInterval(firstToken) || rest.includes(" ")) return null;
        return getPresetCompletions(rest);
      }
      return getPresetCompletions(trimmed);
    },
    handler: async (args, ctx) => {
      tm.setLatestCtx(ctx);
      const raw = (args ?? "").trim();
      const presets = await loadPresets();

      if (!raw) {
        const presetList = Object.entries(presets)
          .map(([key, p]) => `  ${key} — ${p.description} (기본 ${p.defaultInterval.label})`)
          .join("\n");
        const presetHelp = presetList
          ? `\n\n프리셋:\n${presetList}\n예: /until PR  또는  /until 10m PR`
          : "";
        ctx.ui.notify(
          `사용법: /until <간격> <프롬프트>\n예: /until 5m PR 코멘트 확인해줘${presetHelp}`,
          "warning",
        );
        return;
      }

      const rawUpper = raw.toUpperCase();
      const directPreset = presets[rawUpper];
      if (directPreset) {
        tm.register(
          directPreset.defaultInterval.ms,
          directPreset.defaultInterval.label,
          directPreset.prompt,
          ctx,
        );
        return;
      }

      if (!rawUpper.includes(" ") && presetFileExists(rawUpper)) {
        ctx.ui.notify(
          `프리셋 "${rawUpper}" 파일은 있지만 로드에 실패했어.\nfrontmatter(interval/description)와 본문을 확인해줘.`,
          "error",
        );
        return;
      }

      const spaceIdx = raw.indexOf(" ");
      if (spaceIdx === -1) {
        ctx.ui.notify(
          "프롬프트가 필요해. 예: /until 5m PR 코멘트 확인해줘\n프리셋: /until PR",
          "error",
        );
        return;
      }

      const firstToken = raw.slice(0, spaceIdx);
      const rest = raw.slice(spaceIdx + 1).trim();
      const parsed = parseInterval(firstToken);
      if (!parsed) {
        ctx.ui.notify(
          `인터벌 "${firstToken}"을 파싱할 수 없어.\n지원 형식: 5m, 1h, 5분, 1시간, 5분마다, 1시간마다`,
          "error",
        );
        return;
      }

      const restUpper = rest.toUpperCase();
      const restPreset = presets[restUpper];
      if (restPreset) {
        tm.register(parsed.ms, parsed.label, restPreset.prompt, ctx);
        return;
      }

      if (!restUpper.includes(" ") && presetFileExists(restUpper)) {
        ctx.ui.notify(
          `프리셋 "${restUpper}" 파일은 있지만 로드에 실패했어.\nfrontmatter(interval/description)와 본문을 확인해줘.`,
          "error",
        );
        return;
      }

      if (!rest) {
        ctx.ui.notify("프롬프트가 필요해. 예: /until 5m PR 코멘트 확인해줘", "error");
        return;
      }

      tm.register(parsed.ms, parsed.label, rest, ctx);
    },
  });

  pi.registerCommand("untils", {
    description: "활성 until 목록 보기",
    handler: async (_args, ctx) => {
      tm.setLatestCtx(ctx);
      if (tm.tasks.size === 0) {
        ctx.ui.notify("활성 until 작업이 없어.", "info");
        return;
      }
      const now = Date.now();
      const lines = [...tm.tasks.values()]
        .sort((a, b) => a.nextRunAt - b.nextRunAt)
        .map((t) => {
          const remain = formatKoreanDuration(Math.max(0, t.nextRunAt - now));
          const elapsed = formatKoreanDuration(now - t.createdAt);
          const summary = t.lastSummary ? `\n     최근: ${t.lastSummary}` : "";
          return `  #${t.id} · ${t.intervalLabel}마다 · 실행 ${t.runCount}회 · 경과 ${elapsed} · 다음 ${remain} 후${summary}\n     ${t.prompt}`;
        });
      pi.sendMessage({
        customType: CUSTOM_TYPE,
        content: `활성 until 목록 (${tm.tasks.size}개)\n\n${lines.join("\n\n")}`,
        display: true,
      });
    },
  });

  pi.registerCommand("until-cancel", {
    description: "until 취소. 사용법: /until-cancel <id|all>",
    handler: async (args, ctx) => {
      tm.setLatestCtx(ctx);
      const raw = (args ?? "").trim().toLowerCase();
      if (!raw) {
        ctx.ui.notify("사용법: /until-cancel <id|all>", "info");
        return;
      }
      if (raw === "all") {
        const count = tm.tasks.size;
        tm.clearAll();
        ctx.ui.notify(`until ${count}개 취소됨`, "info");
        return;
      }
      const id = Number(raw);
      if (!Number.isInteger(id)) {
        ctx.ui.notify("id는 숫자여야 해. 예: /until-cancel 3", "warning");
        return;
      }
      if (!tm.tasks.has(id)) {
        ctx.ui.notify(`until #${id} 없음`, "warning");
        return;
      }
      tm.remove(id);
      ctx.ui.notify(`until #${id} 취소됨`, "info");
    },
  });
}

export function registerEvents(pi: ExtensionAPI, tm: TaskManager): void {
  pi.on("agent_start", async (_event, ctx) => {
    tm.setAgentRunning(true);
    tm.setLatestCtx(ctx);
  });
  pi.on("agent_end", async (_event, ctx) => {
    tm.setAgentRunning(false);
    tm.setLatestCtx(ctx);
  });

  pi.on("context", async (event) => {
    const filtered = event.messages.filter((m) => {
      if (m.role !== "custom") return true;
      const custom = m as { customType?: string };
      return custom.customType !== CUSTOM_TYPE;
    });
    if (filtered.length === event.messages.length) return;
    return { messages: filtered };
  });

  pi.on("session_start", async (_event, ctx) => {
    tm.setAgentRunning(false);
    tm.setLatestCtx(ctx);
    tm.clearAll();
  });
  pi.on("session_shutdown", async () => {
    tm.setAgentRunning(false);
    tm.clearAll();
  });
}
