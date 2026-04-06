import type { SendMessageFn, SendUserMessageFn } from "./types.js";
interface ReportDetails {
    done: boolean;
    summary: string;
    taskId: number;
    runCount: number;
    nextRunAt?: number;
    elapsed?: string;
}
export declare function createReportTool(sendMsg: SendMessageFn, sendUserMsg: SendUserMessageFn): {
    name: string;
    label: string;
    description: string;
    promptSnippet: string;
    promptGuidelines: string[];
    parameters: import("@sinclair/typebox").TObject<{
        taskId: import("@sinclair/typebox").TNumber;
        done: import("@sinclair/typebox").TBoolean;
        summary: import("@sinclair/typebox").TString;
    }>;
    execute: (_toolCallId: string, params: {
        taskId: number;
        done: boolean;
        summary: string;
    }) => Promise<{
        content: {
            type: "text";
            text: string;
        }[];
        details: ReportDetails;
    }>;
};
export {};
