export declare function isTransient(err: Error): boolean;
export declare function withRetry<T>(fn: () => Promise<T>, maxRetries: number, baseMs: number): Promise<T>;
