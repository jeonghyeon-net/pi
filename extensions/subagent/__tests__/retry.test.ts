import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { SingleResult } from "../core/types.js";
import {
  diagnoseRetryableError,
  diagnoseRetryableResult,
  invokeWithAutoRetry,
} from "../execution/retry.js";

function makeResult(overrides: Partial<SingleResult> = {}): SingleResult {
  return {
    agent: "worker",
    agentSource: "project",
    task: "test task",
    exitCode: 0,
    messages: [],
    stderr: "",
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      cost: 0,
      contextTokens: 0,
      turns: 1,
    },
    ...overrides,
  };
}

function makeResultWithTextOutput(
  text: string,
  overrides: Partial<SingleResult> = {},
): SingleResult {
  return makeResult({
    messages: [
      {
        role: "assistant",
        content: [{ type: "text", text }],
        api: "anthropic-messages" as const,
        provider: "anthropic" as const,
        model: "test",
        usage: {
          input: 0,
          output: 0,
          cacheRead: 0,
          cacheWrite: 0,
          totalTokens: 0,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
        },
        stopReason: "stop",
        timestamp: Date.now(),
      },
    ],
    ...overrides,
  });
}

// ━━━ diagnoseRetryableResult ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("diagnoseRetryableResult", () => {
  it("not retryable for aborted stop reason", () => {
    const result = makeResult({ stopReason: "aborted" });
    const decision = diagnoseRetryableResult(result);
    assert.equal(decision.retryable, false);
  });

  it("extracts first line from multiline error message", () => {
    const result = makeResult({
      exitCode: 1,
      errorMessage: "503 Service Unavailable\nserver overloaded\nplease retry",
    });
    const decision = diagnoseRetryableResult(result);
    assert.ok(decision.retryable);
    if (decision.retryable) assert.equal(decision.reason, "503 Service Unavailable");
  });

  it("uses stderr as reason when errorMessage is whitespace-only", () => {
    const result = makeResult({
      exitCode: 1,
      errorMessage: "   ",
      stderr: "ECONNRESET reset by peer",
    });
    const decision = diagnoseRetryableResult(result);
    assert.ok(decision.retryable);
    if (decision.retryable) assert.equal(decision.reason, "ECONNRESET reset by peer");
  });

  it("not retryable for successful result with output", () => {
    const result = makeResultWithTextOutput("All done!");
    const decision = diagnoseRetryableResult(result);
    assert.equal(decision.retryable, false);
  });

  it("not retryable for empty failure text (no error info at all)", () => {
    const result = makeResult({ exitCode: 0 });
    const decision = diagnoseRetryableResult(result);
    assert.equal(decision.retryable, false);
  });

  it("retryable for network error in stderr", () => {
    const result = makeResult({
      exitCode: 1,
      stderr: "Error: fetch failed due to network issue",
    });
    const decision = diagnoseRetryableResult(result);
    assert.equal(decision.retryable, true);
    assert.ok(decision.reason);
  });

  it("retryable for connection reset in error message", () => {
    const result = makeResult({
      exitCode: 1,
      errorMessage: "Connection reset by peer: ECONNRESET",
    });
    const decision = diagnoseRetryableResult(result);
    assert.equal(decision.retryable, true);
  });

  it("retryable for timeout error", () => {
    const result = makeResult({
      exitCode: 1,
      errorMessage: "Request timed out after 30000ms",
    });
    const decision = diagnoseRetryableResult(result);
    assert.equal(decision.retryable, true);
  });

  it("retryable for rate limit error", () => {
    const result = makeResult({
      exitCode: 1,
      errorMessage: "429 Too Many Requests - rate limit exceeded",
    });
    const decision = diagnoseRetryableResult(result);
    assert.equal(decision.retryable, true);
  });

  it("retryable for 503 service unavailable", () => {
    const result = makeResult({
      exitCode: 1,
      errorMessage: "503 Service Unavailable",
    });
    const decision = diagnoseRetryableResult(result);
    assert.equal(decision.retryable, true);
  });

  it("retryable for 502 bad gateway", () => {
    const result = makeResult({
      exitCode: 1,
      errorMessage: "502 Bad Gateway",
    });
    const decision = diagnoseRetryableResult(result);
    assert.equal(decision.retryable, true);
  });

  it("retryable for overloaded error", () => {
    const result = makeResult({
      exitCode: 1,
      errorMessage: "Server is overloaded, please try again later",
    });
    const decision = diagnoseRetryableResult(result);
    assert.equal(decision.retryable, true);
  });

  it("retryable for ETIMEDOUT", () => {
    const result = makeResult({
      exitCode: 1,
      errorMessage: "connect ETIMEDOUT 1.2.3.4:443",
    });
    const decision = diagnoseRetryableResult(result);
    assert.equal(decision.retryable, true);
  });

  it("not retryable for non-transient error", () => {
    const result = makeResult({
      exitCode: 1,
      errorMessage: "TypeError: Cannot read property 'x' of undefined",
    });
    const decision = diagnoseRetryableResult(result);
    assert.equal(decision.retryable, false);
  });

  it("not retryable for exit code 0 with error stop reason but has output", () => {
    const result = makeResultWithTextOutput("Completed with warnings", {
      stopReason: "error",
      errorMessage: "Some warning",
    });
    // exitCode is 0, stopReason is "error", but there IS final output
    // The function checks: exitCode===0 && stopReason !== "error" && finalOutput => not retryable
    // Since stopReason IS "error", it proceeds to check failureText.
    // "Some warning" does not match transient patterns.
    const decision = diagnoseRetryableResult(result);
    assert.equal(decision.retryable, false);
  });

  it("retryable for socket hang up in stopReason=error", () => {
    const result = makeResult({
      exitCode: 1,
      stopReason: "error",
      errorMessage: "socket hang up",
    });
    const decision = diagnoseRetryableResult(result);
    assert.equal(decision.retryable, true);
  });

  it("retryable for TLS error", () => {
    const result = makeResult({
      exitCode: 1,
      errorMessage: "TLS handshake failed",
    });
    const decision = diagnoseRetryableResult(result);
    assert.equal(decision.retryable, true);
  });

  it("retryable for ECONNREFUSED", () => {
    const result = makeResult({
      exitCode: 1,
      errorMessage: "connect ECONNREFUSED 127.0.0.1:3000",
    });
    const decision = diagnoseRetryableResult(result);
    assert.equal(decision.retryable, true);
  });

  it("retryable for temporarily unavailable", () => {
    const result = makeResult({
      exitCode: 1,
      errorMessage: "Resource temporarily unavailable",
    });
    const decision = diagnoseRetryableResult(result);
    assert.equal(decision.retryable, true);
  });
});

// ━━━ diagnoseRetryableError ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("diagnoseRetryableError", () => {
  it("retryable for Error with network message", () => {
    const decision = diagnoseRetryableError(new Error("network error"));
    assert.equal(decision.retryable, true);
    assert.ok(decision.reason?.includes("network"));
  });

  it("retryable for Error with timeout message", () => {
    const decision = diagnoseRetryableError(new Error("Request timeout after 30s"));
    assert.equal(decision.retryable, true);
  });

  it("retryable for Error with ECONNRESET", () => {
    const error = new Error("ECONNRESET");
    error.name = "ConnectionError";
    const decision = diagnoseRetryableError(error);
    assert.equal(decision.retryable, true);
    assert.ok(decision.reason?.includes("ECONNRESET"));
  });

  it("not retryable for non-transient Error", () => {
    const decision = diagnoseRetryableError(new TypeError("Cannot read properties"));
    assert.equal(decision.retryable, false);
  });

  it("not retryable for null/undefined", () => {
    assert.equal(diagnoseRetryableError(null).retryable, false);
    assert.equal(diagnoseRetryableError(undefined).retryable, false);
  });

  it("handles string errors", () => {
    const decision = diagnoseRetryableError("fetch failed");
    assert.equal(decision.retryable, true);
  });

  it("not retryable for empty string", () => {
    const decision = diagnoseRetryableError("");
    assert.equal(decision.retryable, false);
  });

  it("retryable for rate limit string", () => {
    const decision = diagnoseRetryableError("rate limit exceeded");
    assert.equal(decision.retryable, true);
  });
});

// ━━━ invokeWithAutoRetry ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("invokeWithAutoRetry", () => {
  it("returns successful result without retry", async () => {
    const result = makeResultWithTextOutput("All done!");
    const { result: r, retryCount } = await invokeWithAutoRetry({
      invoke: async () => result,
      maxRetries: 3,
    });
    assert.equal(retryCount, 0);
    assert.equal(r.exitCode, 0);
  });

  it("retries on retryable result and succeeds on second try", async () => {
    let callCount = 0;
    const scheduleLog: number[] = [];

    const { result: r, retryCount } = await invokeWithAutoRetry({
      invoke: async () => {
        callCount++;
        if (callCount === 1) {
          return makeResult({
            exitCode: 1,
            errorMessage: "503 Service Unavailable",
          });
        }
        return makeResultWithTextOutput("Recovered!");
      },
      maxRetries: 3,
      onRetryScheduled: async (info) => {
        scheduleLog.push(info.retryIndex);
      },
    });
    assert.equal(retryCount, 1);
    assert.equal(callCount, 2);
    assert.deepStrictEqual(scheduleLog, [1]);
    // The second call returns the successful result
    assert.ok(r.messages.length > 0);
  });

  it("returns last retryable result when max retries exceeded", async () => {
    let callCount = 0;

    const { result: r, retryCount } = await invokeWithAutoRetry({
      invoke: async () => {
        callCount++;
        return makeResult({
          exitCode: 1,
          errorMessage: "503 Service Unavailable",
        });
      },
      maxRetries: 2,
    });
    // 1 initial + 2 retries = 3 calls total
    assert.equal(callCount, 3);
    assert.equal(retryCount, 2);
    assert.equal(r.exitCode, 1);
  });

  it("uses max delay tier for retry index >= 2", async () => {
    let callCount = 0;
    const delays: number[] = [];

    await invokeWithAutoRetry({
      invoke: async () => {
        callCount++;
        return makeResult({ exitCode: 1, errorMessage: "503 Service Unavailable" });
      },
      maxRetries: 3,
      onRetryScheduled: async (info) => {
        delays.push(info.delayMs);
      },
    });
    // 3 retries exercise all tiers: 2000, 5000, 10000
    assert.equal(callCount, 4);
    assert.deepStrictEqual(delays, [2_000, 5_000, 10_000]);
  });

  it("does not retry non-retryable result", async () => {
    let callCount = 0;

    const { result: r, retryCount } = await invokeWithAutoRetry({
      invoke: async () => {
        callCount++;
        return makeResult({
          exitCode: 1,
          errorMessage: "TypeError: Cannot read property 'x'",
        });
      },
      maxRetries: 3,
    });
    assert.equal(callCount, 1);
    assert.equal(retryCount, 0);
    assert.equal(r.exitCode, 1);
  });

  it("aborts retry when signal is already aborted", async () => {
    const ac = new AbortController();
    ac.abort();

    await assert.rejects(
      invokeWithAutoRetry({
        invoke: async () =>
          makeResult({
            exitCode: 1,
            errorMessage: "503 Service Unavailable",
          }),
        signal: ac.signal,
        maxRetries: 3,
      }),
      (err: Error) => err.message === "Subagent retry aborted",
    );
  });

  it("aborts retry when signal fires during wait", async () => {
    const ac = new AbortController();
    let callCount = 0;

    const promise = invokeWithAutoRetry({
      invoke: async () => {
        callCount++;
        return makeResult({
          exitCode: 1,
          errorMessage: "503 Service Unavailable",
        });
      },
      signal: ac.signal,
      maxRetries: 3,
      onRetryScheduled: async () => {
        // Abort during the wait phase
        setTimeout(() => ac.abort(), 50);
      },
    });

    await assert.rejects(promise, (err: Error) => err.message === "Subagent retry aborted");
    assert.equal(callCount, 1);
  });

  it("retries on retryable thrown error and succeeds", async () => {
    let callCount = 0;
    const scheduleLog: number[] = [];

    const { result: r, retryCount } = await invokeWithAutoRetry({
      invoke: async () => {
        callCount++;
        if (callCount === 1) throw new Error("network timeout");
        return makeResultWithTextOutput("Recovered after throw!");
      },
      maxRetries: 3,
      onRetryScheduled: async (info) => {
        scheduleLog.push(info.retryIndex);
      },
    });
    assert.equal(callCount, 2);
    assert.equal(retryCount, 1);
    assert.deepStrictEqual(scheduleLog, [1]);
    assert.ok(r.messages.length > 0);
  });

  it("throws non-retryable error immediately", async () => {
    let callCount = 0;

    await assert.rejects(
      invokeWithAutoRetry({
        invoke: async () => {
          callCount++;
          throw new TypeError("Cannot read property 'x'");
        },
        maxRetries: 3,
      }),
      TypeError,
    );
    assert.equal(callCount, 1);
  });

  it("throws when retryable error exceeds max retries", async () => {
    let callCount = 0;

    await assert.rejects(
      invokeWithAutoRetry({
        invoke: async () => {
          callCount++;
          throw new Error("network timeout");
        },
        maxRetries: 2,
      }),
      { message: "network timeout" },
    );
    // 1 initial + 2 retries = 3 calls
    assert.equal(callCount, 3);
  });

  it("rethrows error when signal is already aborted on catch path", async () => {
    const ac = new AbortController();
    ac.abort();

    await assert.rejects(
      invokeWithAutoRetry({
        invoke: async () => {
          throw new Error("network timeout");
        },
        signal: ac.signal,
        maxRetries: 3,
      }),
      { message: "network timeout" },
    );
  });
});
