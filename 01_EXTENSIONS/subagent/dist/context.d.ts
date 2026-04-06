export interface Entry {
    type: string;
    message?: {
        role: string;
        content: Array<{
            type: string;
            text?: string;
        }>;
    };
    summary?: string;
}
export declare function extractMainContext(entries: Entry[], maxMessages: number): string;
