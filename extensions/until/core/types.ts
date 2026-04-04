export interface ParsedInterval {
  ms: number;
  label: string;
}

export interface UntilPreset {
  defaultInterval: ParsedInterval;
  prompt: string;
  description: string;
}

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
