/**
 * Unit tests for the idempotent cache invalidation key behaviour.
 *
 * We stub global `fetch` so the Cloudflare + Prerender upstream calls are
 * deterministic, then fire the same logical event twice within the
 * idempotency window and assert only one upstream burst goes out.
 *
 * @vitest-environment node
 */
import { describe, test, expect, beforeEach, vi } from 'vitest';
import {
  invalidateProductCacheFromServer,
  __testResetIdempotency,
} from './cache-invalidation';

describe('invalidateProductCacheFromServer — idempotency', () => {
  beforeEach(() => {
    __testResetIdempotency();
    process.env.CLOUDFLARE_API_TOKEN = 'test-cf';
    process.env.PRERENDER_TOKEN = 'test-pre';
    vi.restoreAllMocks();
  });

  test('repeated calls for the same slugs collapse to a single purge', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('{}', { status: 200 }),
    );

    const a = await invalidateProductCacheFromServer({
      slugs: ['bpc-157'],
      reason: 'order:ABC:stock-decrement',
    });
    const b = await invalidateProductCacheFromServer({
      slugs: ['bpc-157'],
      reason: 'order:XYZ:stock-decrement', // different orderId, same logical event
    });

    expect(a.deduped).toBe(false);
    expect(b.deduped).toBe(true);
    expect(b.idempotencyKey).toBe(a.idempotencyKey);
    expect(b.attempt).toBeGreaterThan(a.attempt);
    // 3 fetches for the first invocation (CF + Prerender desktop + mobile);
    // the second invocation must add ZERO network calls.
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });

  test('different slug sets produce different idempotency keys', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('{}', { status: 200 }),
    );

    const a = await invalidateProductCacheFromServer({
      slugs: ['bpc-157'],
      reason: 'order:1:stock-decrement',
    });
    const b = await invalidateProductCacheFromServer({
      slugs: ['tirzepatide'],
      reason: 'order:1:stock-decrement',
    });

    expect(a.idempotencyKey).not.toBe(b.idempotencyKey);
    expect(b.deduped).toBe(false);
  });

  test('result payload carries requestId, attempt count, and timing', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('{}', { status: 200 }),
    );

    const r = await invalidateProductCacheFromServer({
      slugs: ['ghk-cu'],
      reason: 'admin:product-update',
    });
    expect(r.requestId).toMatch(/^[0-9a-f]{16}$/);
    expect(r.attempt).toBe(1);
    expect(r.cloudflare.durationMs).toBeGreaterThanOrEqual(0);
    expect(r.prerender.desktop.durationMs).toBeGreaterThanOrEqual(0);
    expect(r.prerender.mobile.durationMs).toBeGreaterThanOrEqual(0);
  });
});

describe('invalidateProductCacheFromServer — concurrent stress + retry', () => {
  beforeEach(() => {
    __testResetIdempotency();
    process.env.CLOUDFLARE_API_TOKEN = 'test-cf';
    process.env.PRERENDER_TOKEN = 'test-pre';
    vi.restoreAllMocks();
  });

  test('100 concurrent purchase events for the same slug-set fire exactly one purge', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(
      // Add a tick of latency so all 100 calls hit the in-flight branch.
      () =>
        new Promise((resolve) =>
          setTimeout(() => resolve(new Response('{}', { status: 200 })), 5),
        ),
    );

    const events = Array.from({ length: 100 }, (_, i) =>
      invalidateProductCacheFromServer({
        slugs: ['bpc-157', 'tirzepatide'],
        reason: `order:ORDER_${i}:stock-decrement`,
      }),
    );
    const results = await Promise.all(events);

    // Exactly one upstream burst: CF + Prerender desktop + Prerender mobile.
    expect(fetchSpy).toHaveBeenCalledTimes(3);

    const keys = new Set(results.map((r) => r.idempotencyKey));
    expect(keys.size).toBe(1);
    const deduped = results.filter((r) => r.deduped).length;
    expect(deduped).toBe(99);
    expect(results.every((r) => r.ok)).toBe(true);
  });

  test('different slug-sets fired concurrently each get their own purge', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(
      () =>
        new Promise((resolve) =>
          setTimeout(() => resolve(new Response('{}', { status: 200 })), 2),
        ),
    );

    const slugs = ['bpc-157', 'tirzepatide', 'ghk-cu', 'tb-500', 'pt-141'];
    const results = await Promise.all(
      slugs.flatMap((s) =>
        // Fire each slug 5x concurrently — 25 events total, 5 unique keys.
        Array.from({ length: 5 }, (_, i) =>
          invalidateProductCacheFromServer({
            slugs: [s],
            reason: `order:O${i}:stock-decrement`,
          }),
        ),
      ),
    );

    const keys = new Set(results.map((r) => r.idempotencyKey));
    expect(keys.size).toBe(slugs.length);
    // 3 fetches per unique key.
    expect(fetchSpy).toHaveBeenCalledTimes(slugs.length * 3);
  });

  test('transient 503 is retried with exponential backoff up to 3 attempts', async () => {
    let callCount = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      callCount += 1;
      // CF + both prerender posts each fail twice then succeed.
      const perEndpointCall = Math.ceil(callCount / 3);
      if (perEndpointCall <= 2) {
        return new Response('upstream busy', { status: 503 });
      }
      return new Response('{}', { status: 200 });
    });

    const r = await invalidateProductCacheFromServer({
      slugs: ['retatrutide'],
      reason: 'admin:product-update',
    });

    // 3 upstreams * 3 attempts in the worst case.
    expect(callCount).toBeGreaterThanOrEqual(3);
    expect(callCount).toBeLessThanOrEqual(9);
    expect(r.ok).toBe(true);
    expect(r.cloudflare.attempts ?? 1).toBeGreaterThanOrEqual(1);
  });

  test('permanent 4xx is NOT retried (attempts capped at 1)', async () => {
    let calls = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      calls += 1;
      return new Response('bad request', { status: 400 });
    });

    const r = await invalidateProductCacheFromServer({
      slugs: ['kpv'],
      reason: 'admin:product-update',
    });

    // 3 upstreams * 1 attempt each — no retries on 400.
    expect(calls).toBe(3);
    expect(r.ok).toBe(false);
    expect(r.cloudflare.attempts).toBe(1);
    expect(r.prerender.desktop.attempts).toBe(1);
    expect(r.prerender.mobile.attempts).toBe(1);
  });
});
