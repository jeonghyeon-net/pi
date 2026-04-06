import type { Todo } from "./types.js";
export declare const SPINNER_INTERVAL_MS = 120;
export declare function createWidgetFactory(todos: Todo[], firstActive: Todo | undefined, running: boolean, onStartSpinner: (timer: ReturnType<typeof setInterval>) => void): (tui: {
    requestRender(): void;
}, theme: {
    fg(color: string, text: string): string;
    bold(text: string): string;
    strikethrough(text: string): string;
}) => {
    render(width: number): string[];
    invalidate(): void;
};
