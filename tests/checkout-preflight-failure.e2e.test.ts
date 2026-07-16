/**
 * Checkout resilience contract tests.
 *
 * Scope: the two client-side utilities that gate the Wallid Pay button
 * (preflight retry + telemetry logger). We do not mount the full checkout
 * page here — it depends on Firebase Auth, Firestore, and analytics globals
 * that vitest can't reasonably fake. Instead we assert the behaviour the
 * page relies on:
 *
 *   1. Preflight retries on 5xx / network errors with exponential backoff.
 *   2. After all retries fail, the caller receives the error (the checkout
 *      page then keeps the Pay button enabled and lets createOrder run —
 *      that page-level assertion is covered manually in preview QA; the
 *      contract asserted here is that the util does not swallow the error).
 *   3. Telemetry never throws even when Firestore writes fail.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { callPreflightWithRetry } from '../src/lib/checkoutPreflightRetry';

vi.mock('../src/lib/firebase', () => ({ db: {} }));

// Capture addDoc calls so we can assert telemetry payloads without touching
// real Firestore. `serverTimestamp` is a placeholder value.
const addDocMock = vi.fn();
vi.mock('firebase/firestore', () => ({
  addDoc: (...args: unknown[]) => addDocMock(...args),
  collection: (_db: unknown, name: string) => ({ name }),
  serverTimestamp: () => '__server_ts__',
}));

// Import after mocks so the module picks them up.
import { logCheckoutEvent } from '../src/lib/checkoutTelemetry';

describe('callPreflightWithRetry', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns immediately on first success', async () => {
    const fn = vi.fn().mockResolvedValue({ ok: true });
    const result = await callPreflightWithRetry(fn, { maxRetries: 3, baseDelayMs: 1000 });
    expect(result).toEqual({ ok: true });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries transient 500 errors up to maxRetries then rethrows', async () => {
    const err = Object.assign(new Error('boom'), { statusCode: 500 });
    const fn = vi.fn().mockRejectedValue(err);
    const attempts: number[] = [];

    const promise = callPreflightWithRetry(fn, {
      maxRetries: 3,
      baseDelayMs: 1000,
      onAttempt: (a) => attempts.push(a),
    }).catch((e) => e);

    // Drain scheduled backoffs (1s + 2s + 4s).
    await vi.advanceTimersByTimeAsync(1_000);
    await vi.advanceTimersByTimeAsync(2_000);
    await vi.advanceTimersByTimeAsync(4_000);

    const outcome = await promise;
    expect(outcome).toBe(err);
    expect(fn).toHaveBeenCalledTimes(4); // 1 initial + 3 retries
    expect(attempts).toEqual([1, 2, 3, 4]);
  });

  it('does not retry deterministic 4xx errors', async () => {
    const err = Object.assign(new Error('bad request'), { statusCode: 400 });
    const fn = vi.fn().mockRejectedValue(err);
    const outcome = await callPreflightWithRetry(fn, { maxRetries: 3, baseDelayMs: 10 }).catch((e) => e);
    expect(outcome).toBe(err);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries plain thrown errors (no statusCode → treat as network)', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce({ ok: true });
    const promise = callPreflightWithRetry(fn, { maxRetries: 3, baseDelayMs: 500 });
    await vi.advanceTimersByTimeAsync(500);
    await expect(promise).resolves.toEqual({ ok: true });
    expect(fn).toHaveBeenCalledTimes(2);
  });
});

describe('logCheckoutEvent', () => {
  beforeEach(() => {
    addDocMock.mockReset();
  });

  it('writes to the checkoutTelemetry collection', async () => {
    addDocMock.mockResolvedValueOnce({ id: 'x' });
    await logCheckoutEvent({
      stage: 'pay_click',
      cartId: 'cart-1',
      timestamp: 123,
    });
    expect(addDocMock).toHaveBeenCalledTimes(1);
    const [colRef, payload] = addDocMock.mock.calls[0];
    expect((colRef as { name: string }).name).toBe('checkoutTelemetry');
    expect(payload).toMatchObject({
      stage: 'pay_click',
      cartId: 'cart-1',
      timestamp: 123,
      loggedAt: '__server_ts__',
    });
  });

  it('never throws when Firestore write fails', async () => {
    addDocMock.mockRejectedValueOnce(new Error('offline'));
    await expect(
      logCheckoutEvent({ stage: 'pay_click', cartId: 'c', timestamp: 0 }),
    ).resolves.toBeUndefined();
  });
});
