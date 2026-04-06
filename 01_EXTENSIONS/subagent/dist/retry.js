const TRANSIENT_PATTERNS = [/ECONNRESET/, /ETIMEDOUT/, /ENOTFOUND/, /429/, /5\d{2}/];
export function isTransient(err) {
    return TRANSIENT_PATTERNS.some((p) => p.test(err.message));
}
export async function withRetry(fn, maxRetries, baseMs) {
    let lastErr;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            return await fn();
        }
        catch (err) {
            lastErr = err instanceof Error ? err : new Error(String(err));
            if (!isTransient(lastErr) || attempt === maxRetries)
                throw lastErr;
            await new Promise((r) => setTimeout(r, baseMs * 2 ** attempt));
        }
    }
    throw lastErr;
}
