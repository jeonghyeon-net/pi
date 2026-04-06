import type { UntilPreset } from "./types.js";
export declare function loadPresets(dir: string): Promise<Record<string, UntilPreset>>;
export declare function getPresetCompletions(dir: string, prefix: string): {
    value: string;
    label: string;
}[] | null;
