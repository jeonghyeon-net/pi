import { Type } from "@sinclair/typebox";
import type { SendMessageFn, SendUserMessageFn } from "./types.js";
import { formatKoreanDuration, formatClock } from "./time-utils.js";
import { initApi, getTask, deleteTask } from "./state.js";

interface ReportDetails {
	done: boolean;
	summary: string;
	taskId: number;
	runCount: number;
	nextRunAt?: number;
	elapsed?: string;
}

export function createReportTool(sendMsg: SendMessageFn, sendUserMsg: SendUserMessageFn) {
	initApi(sendMsg, sendUserMsg);
	return {
		name: "until_report",
		label: "Until Report",
		description: "until 반복 작업의 결과를 보고합니다. 조건 충족 시 done: true로 반복을 종료합니다.",
		promptSnippet: "Report until-loop result: done (condition met?) + summary",
		promptGuidelines: ["until 반복 작업 프롬프트를 받으면, 작업 수행 후 반드시 until_report를 호출하세요."],
		parameters: Type.Object({
			taskId: Type.Number({ description: "until task ID (프롬프트의 #N)" }),
			done: Type.Boolean({ description: "조건이 충족되었으면 true, 아니면 false" }),
			summary: Type.String({ description: "현재 상태를 한 줄로 요약" }),
		}),
		execute: (
			_toolCallId: string,
			params: { taskId: number; done: boolean; summary: string },
		): Promise<{ content: { type: "text"; text: string }[]; details: ReportDetails }> => {
			return Promise.resolve(handleReport(params));
		},
	};
}

function handleReport(params: { taskId: number; done: boolean; summary: string }): {
	content: { type: "text"; text: string }[];
	details: ReportDetails;
} {
	const task = getTask(params.taskId);
	if (!task) throw new Error(`until #${params.taskId} 작업을 찾을 수 없습니다. 이미 완료/취소/만료되었을 수 있습니다.`);
	task.inFlight = false;
	task.lastSummary = params.summary;
	if (params.done) {
		const elapsed = formatKoreanDuration(Date.now() - task.createdAt);
		const details: ReportDetails = { done: true, summary: params.summary, taskId: task.id, runCount: task.runCount, elapsed };
		deleteTask(task.id);
		return { content: [{ type: "text", text: `until #${task.id} 조건 충족으로 종료됨. ${params.summary}` }], details };
	}
	return {
		content: [{ type: "text", text: `until #${task.id} 계속 반복. 다음 실행: ${formatClock(task.nextRunAt)}. ${params.summary}` }],
		details: { done: false, summary: params.summary, taskId: task.id, runCount: task.runCount, nextRunAt: task.nextRunAt },
	};
}
