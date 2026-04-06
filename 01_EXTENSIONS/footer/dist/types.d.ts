import type { Theme, ThemeColor } from "@mariozechner/pi-coding-agent";
export type { ThemeColor };
export type ThemeBg = Parameters<Theme["bg"]>[0];
export declare const BAR_WIDTH = 10;
export declare const DIRTY_CHECK_INTERVAL_MS = 3000;
export declare const NAME_STATUS_KEY = "session-name";
export type ExecFn = (command: string, args: string[], options?: {
    cwd?: string;
}) => Promise<{
    stdout: string;
    code: number;
}>;
export interface FooterTui {
    requestRender(): void;
}
export interface FooterTheme {
    fg: (color: ThemeColor, text: string) => string;
    bg: (color: ThemeBg, text: string) => string;
    bold: (text: string) => string;
}
export interface FooterStatusData {
    getExtensionStatuses: () => ReadonlyMap<string, string>;
    getGitBranch: () => string | null;
    onBranchChange: (listener: () => void) => () => void;
}
export interface FooterComponent {
    render(width: number): string[];
    invalidate(): void;
    dispose(): void;
}
export interface FooterContext {
    hasUI: boolean;
    model: {
        id: string;
    } | undefined;
    getContextUsage(): {
        percent: number | null;
    } | undefined;
    sessionManager: {
        getCwd(): string;
        getSessionName(): string | undefined;
    };
    ui: {
        setFooter(factory: ((tui: FooterTui, theme: FooterTheme, footerData: FooterStatusData) => FooterComponent) | undefined): void;
    };
}
export declare const STATUS_STYLE_MAP: Record<string, (theme: FooterTheme, text: string) => string>;
