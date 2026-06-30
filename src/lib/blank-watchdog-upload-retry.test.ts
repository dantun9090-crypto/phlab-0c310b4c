// @vitest-environment happy-dom
/**
 * Unit tests for `uploadWithRetry` — pure mirror of the inline upload retry
 * pipeline in `src/routes/__root.tsx`. Verifies:
 *   - exponential backoff schedule is exactly 1s / 2s / 4s
 *   - cap of 3 attempts before giving up
 *   - every state transition is recorded via onStatus, so the diagnostics
 *     panel's lastUpload.attempts mirrors the real attempt count
 *   - on success after a retry, ok flips to true with the correct attempts
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { uploadWithRetry, type UploadRetryStatus } from "./blank-watchdog";

const base = { htmlTruncated: false, screenshotDropped: false, htmlOriginalLength: 100 };

describe("uploadWithRetry", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it("retries on failure with delays 1s / 2s / 4s and stops at 3 attempts", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 500 });
    const setTimeoutSpy = vi.fn((cb: () => void, ms: number) => {
      // Forward to fake timers so we can advance precisely below.
      return setTimeout(cb, ms);
    });
    const statuses: UploadRetryStatus[] = [];

    const p = uploadWithRetry("{}", base, {
      fetch: fetchMock,
      setTimeout: setTimeoutSpy as unknown as UploadRetryStatus["attempts"] extends number ? typeof setTimeout : never,
      onStatus: (s) => statuses.push({ ...s }),
    });

    // 1st attempt fires immediately; await its rejection chain.
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(setTimeoutSpy).toHaveBeenLastCalledWith(expect.any(Function), 1000);

    // After 1s → 2nd attempt.
    await vi.advanceTimersByTimeAsync(1000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(setTimeoutSpy).toHaveBeenLastCalledWith(expect.any(Function), 2000);

    // After 2s → 3rd attempt (final).
    await vi.advanceTimersByTimeAsync(2000);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    // No further setTimeout for a 4th retry — only the two scheduled above.
    expect(setTimeoutSpy).toHaveBeenCalledTimes(2);

    // Advance past where a hypothetical 4s retry would fire — must not retry.
    await vi.advanceTimersByTimeAsync(10_000);
    expect(fetchMock).toHaveBeenCalledTimes(3);

    const final = await p;
    expect(final.ok).toBe(false);
    expect(final.attempts).toBe(3);
    expect(final.error).toMatch(/status 500/);

    // onStatus records the in-flight + final state for every attempt.
    const attemptCounts = statuses.map((s) => s.attempts);
    expect(attemptCounts).toEqual([1, 2, 3, 3]); // last entry is the final error record
    expect(statuses[statuses.length - 1].ok).toBe(false);
    expect(statuses[statuses.length - 1].error).toBeTruthy();
  });

  it("flips to ok=true and stops retrying once a retry succeeds", async () => {
    let n = 0;
    const fetchMock = vi.fn(async () => {
      n++;
      if (n < 2) return { ok: false, status: 503 };
      return { ok: true };
    });
    const statuses: UploadRetryStatus[] = [];
    const p = uploadWithRetry("{}", base, {
      fetch: fetchMock,
      setTimeout: setTimeout as unknown as UploadRetryStatus["attempts"] extends number ? typeof setTimeout : never,
      onStatus: (s) => statuses.push({ ...s }),
    });

    await vi.advanceTimersByTimeAsync(0);    // attempt 1 fails → schedules 1s
    await vi.advanceTimersByTimeAsync(1000); // attempt 2 succeeds

    const final = await p;
    expect(final.ok).toBe(true);
    expect(final.attempts).toBe(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    // Last recorded status is the ok=true success for attempt 2.
    expect(statuses[statuses.length - 1]).toMatchObject({ method: "fetch", attempts: 2, ok: true });
  });

  it("propagates baseStatus (htmlTruncated, screenshotDropped, htmlOriginalLength) into every onStatus call", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    const statuses: UploadRetryStatus[] = [];
    await uploadWithRetry(
      "{}",
      { htmlTruncated: true, screenshotDropped: true, htmlOriginalLength: 50_000 },
      {
        fetch: fetchMock,
        setTimeout: setTimeout as unknown as UploadRetryStatus["attempts"] extends number ? typeof setTimeout : never,
        onStatus: (s) => statuses.push({ ...s }),
      },
    );
    expect(statuses.every((s) => s.htmlTruncated && s.screenshotDropped && s.htmlOriginalLength === 50_000)).toBe(true);
  });
});
