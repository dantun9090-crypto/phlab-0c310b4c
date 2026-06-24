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
