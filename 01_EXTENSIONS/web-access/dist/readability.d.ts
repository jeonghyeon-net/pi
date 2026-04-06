export interface ReadableResult {
    title: string;
    content: string;
}
export declare function htmlToMarkdown(html: string): ReadableResult | null;
