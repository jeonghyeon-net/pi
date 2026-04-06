export interface UntilTask {
    id: number;
    prompt: string;
    intervalMs: number;
    intervalLabel: string;
    createdAt: number;
    expiresAt: number;
    nextRunAt: number;
    runCount: number;
    inFlight: boolean;
    lastSummary?: string;
    timer: ReturnType<typeof setTimeout>;
}
export interface UntilPreset {
    defaultInterval: ParsedInterval;
    prompt: string;
    description: string;
}
export interface ParsedInterval {
    ms: number;
    label: string;
}
export interface MessageOpts {
    customType: string;
    content: string;
    display: boolean;
    details?: unknown;
}
export type SendMessageFn = (opts: MessageOpts) => void;
export type SendUserMessageFn = (msg: string, opts?: {
    deliverAs?: "followUp" | "steer";
}) => void;
