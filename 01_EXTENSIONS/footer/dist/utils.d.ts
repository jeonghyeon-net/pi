import type { ExecFn, FooterTheme } from "./types.js";
export declare function clamp(n: number, min: number, max: number): number;
export declare function getFolderName(cwd: string): string;
export declare function sanitizeStatusText(text: string): string;
export declare function styleStatus(theme: FooterTheme, key: string, text: string): string;
export declare function getRepoName(cwd: string, exec: ExecFn): Promise<string | null>;
export declare function hasUncommittedChanges(cwd: string, exec: ExecFn): Promise<boolean>;
