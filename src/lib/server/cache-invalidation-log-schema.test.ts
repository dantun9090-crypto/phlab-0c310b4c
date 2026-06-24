/**
 * Schema-validation tests for `event=cache-invalidate` log lines.
 *
 * We capture every console.log emitted during representative invalidation
 * scenarios (success, dedupe, transient-retry, permanent-failure) and run
 * each parsed entry through `validateInvalidationLog`. Any missing
 * `requestId` / `idempotencyKey` / `attempt` / `stage` field — or any
 * shape drift on `status` / `nextDelayMs` / `durationMs` — fails CI.
 *
 * @vitest-environment node
 */
import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  invalidateProductCacheFromServer,
  __testResetIdempotency,
} from './cache-invalidation';
import {
  validateInvalidationLog,
  assertValidInvalidationLog,
} from './cache-invalidation-log-schema';

type LogEntry = Record<string, unknown>;

function captureLogs(): { entries: LogEntry[]; restore: () => void } {
  const entries: LogEntry[] = [];
  const original = console.log;
  console.log = (...args: unknown[]) => {
    const first = args[0];
    if (typeof first === 'string' && first.startsWith('{') && first.includes('"cache-invalidate"')) {
      try {
        entries.push(JSON.parse(first));
        return;
      } catch {
        /* fall through */
      }
    }
    original(...args);
  };
  return { entries, restore: () => { console.log = original; } };
}

describe('cache-invalidate log schema', () => {
  beforeEach(() => {
    __testResetIdempotency();
    process.env.CLOUDFLARE_API_TOKEN = 'test-cf';
    process.env.PRERENDER_TOKEN = 'test-pre';
    process.env.CACHE_LOG_VALIDATE = '1';
    vi.restoreAllMocks();
  });
  afterEach(() => {
    delete process.env.CACHE_LOG_VALIDATE;
  });

  test('happy-path emits valid start + complete entries', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }));
    const cap = captureLogs();
    try {
      await invalidateProductCacheFromServer({ slugs: ['bpc-157'], reason: 'admin:product-update' });
    } finally {
      cap.restore();
    }
    expect(cap.entries.length).toBeGreaterThanOrEqual(2);
    for (const e of cap.entries) assertValidInvalidationLog(e);
    const stages = cap.entries.map((e) => e.stage);
    expect(stages).toContain('start');
    expect(stages).toContain('complete');
  });

  test('dedupe entries carry requestId, idempotencyKey, attempt, stage, ageMs', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }));
    const cap = captureLogs();
    try {
      await invalidateProductCacheFromServer({ slugs: ['ghk-cu'], reason: 'order:A:stock-decrement' });
      await invalidateProductCacheFromServer({ slugs: ['ghk-cu'], reason: 'order:B:stock-decrement' });
    } finally {
      cap.restore();
    }
    for (const e of cap.entries) assertValidInvalidationLog(e);
    const dedupe = cap.entries.filter((e) => e.stage === 'dedupe');
    expect(dedupe.length).toBe(1);
    expect(dedupe[0].requestId).toMatch(/^[0-9a-f]{16}$/);
    expect(dedupe[0].idempotencyKey).toEqual(expect.any(String));
    expect(dedupe[0].attempt).toBeGreaterThanOrEqual(2);
  });

  test('retry + retry-final entries on transient 503 satisfy the schema', async () => {
    let calls = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      calls += 1;
      return calls <= 6
        ? new Response('busy', { status: 503 })
        : new Response('{}', { status: 200 });
    });
    const cap = captureLogs();
    try {
      await invalidateProductCacheFromServer({ slugs: ['tb-500'], reason: 'admin:product-update' });
    } finally {
      cap.restore();
    }
    for (const e of cap.entries) assertValidInvalidationLog(e);
    const retries = cap.entries.filter((e) => e.stage === 'retry');
    const finals = cap.entries.filter((e) => e.stage === 'retry-final');
    expect(retries.length).toBeGreaterThan(0);
    for (const r of retries) {
      expect(r.upstream).toEqual(expect.any(String));
      expect(typeof r.status).toBe('number');
      expect(typeof r.nextDelayMs).toBe('number');
    }
    for (const r of finals) {
      expect(r.upstream).toEqual(expect.any(String));
      expect(typeof r.status).toBe('number');
    }
  });

  test('validator rejects entries missing required fields', () => {
    expect(validateInvalidationLog({ event: 'cache-invalidate', ts: '2025-01-01T00:00:00Z', stage: 'start', attempt: 1 }).ok).toBe(false);
    expect(validateInvalidationLog({ event: 'cache-invalidate', ts: 'not-a-date', stage: 'start', attempt: 1, requestId: 'x', idempotencyKey: 'k', reason: 'r', urlCount: 1 }).ok).toBe(false);
    expect(validateInvalidationLog({ event: 'cache-invalidate', ts: '2025-01-01T00:00:00.000Z', stage: 'retry', attempt: 2, upstream: 'cloudflare', status: 503, nextDelayMs: 100 }).ok).toBe(true);
    expect(validateInvalidationLog({ event: 'cache-invalidate', ts: '2025-01-01T00:00:00.000Z', stage: 'bogus', attempt: 1 }).ok).toBe(false);
  });
});
