import type { FooterContext, FooterStatusData, FooterTheme } from "./types.js";
export declare function buildFooterStatusEntries(ctx: FooterContext, footerData: FooterStatusData): (readonly [string, string])[];
export declare function buildFooterLineParts(theme: FooterTheme, ctx: FooterContext, footerData: FooterStatusData, repoName: string | null, hasDirtyChanges: boolean, width: number): {
    statusEntries: (readonly [string, string])[];
    left: string;
    mid: string;
    right: string;
    pad: string;
};
