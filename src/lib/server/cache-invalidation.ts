/**
 * Server-only cache invalidation helpers used by trusted server mutations
 * (product edits, stock decrements after purchase).
 *
 * Hardened with:
 *   - **Idempotent keys** — repeated events for the same slugs/categories
 *     within IDEMPOTENCY_WINDOW_MS collapse to a single purge so cache
 *     converges deterministically (no thrash from retried webhooks or a
 *     burst of orders touching the same SKU).
 *   - **Structured logging** — every attempt emits a single JSON line with
 *     requestId, idempotencyKey, slugs/categories, attempt count, and
 *     per-upstream (Cloudflare / Prerender desktop / Prerender mobile)
 *     latency + status so the refresh-loop diagnostics in production logs
 *     have one stable shape to grep on (event=cache-invalidate).
 *
 * These functions do not require an admin idToken because they are not
 * exposed directly to clients.
 */

const CF_ZONE_ID = 'ed093ef4578e8e3568e26c3e979558c6';
const ORIGIN = 'https://phlabs.co.uk';

const CATEGORIES = [
  'metabolic-signaling',
  'tissue-repair',
  'cognitive-research',
  'longevity',
  'growth-hormone',
  'skin-research',
  'blends',
];

const IDEMPOTENCY_WINDOW_MS = 30_000;

type IdempotencyRecord = {
  key: string;
  firstSeen: number;
  hits: number;
  inflight?: Promise<InvalidationResult>;
  result?: InvalidationResult;
};

const idempotencyCache = new Map<string, IdempotencyRecord>();

function pruneIdempotency(now: number) {
  for (const [k, v] of idempotencyCache) {
    if (now - v.firstSeen > IDEMPOTENCY_WINDOW_MS) idempotencyCache.delete(k);
  }
}

function buildIdempotencyKey(reason: string | undefined, urls: string[]): string {
  const sorted = [...urls].sort().join('|');
  // Strip volatile suffixes from reason (e.g. timestamps, orderIds with
  // millisecond precision) so retries of the SAME event hash identically.
  // Keep the high-level reason prefix (e.g. "order:*:stock-decrement") so
  // semantically different events do not collide.
  const reasonKey = (reason ?? 'unknown').replace(/:\w+:/, ':*:');
  return `${reasonKey}::${sorted}`;
}

function makeRequestId(): string {
  const bytes = new Uint8Array(8);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function logInvalidate(fields: Record<string, unknown>) {
  try {
    // Single-line structured log — easy to parse in CF/Worker logs.
    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ event: 'cache-invalidate', ts: new Date().toISOString(), ...fields }));
  } catch {
    /* ignore */
  }
}

export type ProductCacheInvalidationInput = {
  slugs?: string[];
  categories?: string[];
  reason?: string;
};

type UpstreamResult = { ok: boolean; status: number; error?: string; durationMs: number };

export type InvalidationResult = {
  ok: boolean;
  urls: number;
  cloudflare: UpstreamResult;
  prerender: {
    ok: boolean;
    desktop: UpstreamResult;
    mobile: UpstreamResult;
  };
  reason: string;
  requestId: string;
  idempotencyKey: string;
  attempt: number;
  deduped: boolean;
  timestamp: string;
};

function sanitizeSlug(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const v = value.trim();
  return /^[a-z0-9][a-z0-9-]{0,119}$/i.test(v) ? v : null;
}

function sanitizeCategory(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const v = value.trim();
  return /^[a-z0-9-]{1,60}$/i.test(v) ? v : null;
}

export function productCacheUrls(input: ProductCacheInvalidationInput = {}): string[] {
  const urls = new Set<string>([
    `${ORIGIN}/`,
    `${ORIGIN}/products`,
    `${ORIGIN}/sitemap.xml`,
    `${ORIGIN}/robots.txt`,
  ]);

  for (const cat of CATEGORIES) {
    urls.add(`${ORIGIN}/products/category/${cat}`);
    urls.add(`${ORIGIN}/products?category=${cat}`);
  }

  for (const cat of input.categories ?? []) {
    const clean = sanitizeCategory(cat);
    if (!clean) continue;
    urls.add(`${ORIGIN}/products/category/${clean}`);
    urls.add(`${ORIGIN}/products?category=${clean}`);
  }

  for (const slug of input.slugs ?? []) {
    const clean = sanitizeSlug(slug);
    if (clean) urls.add(`${ORIGIN}/products/${clean}`);
  }

  return [...urls];
}

async function timed<T extends { ok: boolean; status: number; error?: string }>(
  fn: () => Promise<T>,
): Promise<T & { durationMs: number; attempts: number }> {
  const t0 = Date.now();
  try {
    const r = await fn();
    return { ...r, durationMs: Date.now() - t0, attempts: (r as { attempts?: number }).attempts ?? 1 };
  } catch (e) {
    return {
      ok: false,
      status: 0,
      error: e instanceof Error ? e.message : String(e),
      durationMs: Date.now() - t0,
      attempts: 1,
    } as T & { durationMs: number; attempts: number };
  }
}

/**
 * Exponential backoff with bounded retries for transient upstream failures.
 *
 * A "transient" failure is a network error, an HTTP 5xx, or a 429. 4xx
 * responses (except 429) are caller errors — retrying just burns quota and
 * keeps the page in its current refresh attempt longer, so we stop early.
 *
 * MAX_ATTEMPTS = 3 → delays roughly 200ms, 400ms (+jitter). Total worst-
 * case latency stays well under the 10s per-upstream AbortSignal so a
 * single invalidation call never blocks a request thread for more than
 * ~21s in the absolute worst case. The idempotency cache ensures a burst
 * of retried webhooks does NOT amplify this — they all coalesce onto the
 * one in-flight promise.
 */
const MAX_ATTEMPTS = 3;
const BASE_DELAY_MS = 200;

function isTransientStatus(status: number): boolean {
  return status === 0 || status === 429 || (status >= 500 && status < 600);
}

async function withRetry<T extends { ok: boolean; status: number; error?: string }>(
  label: string,
  fn: () => Promise<T>,
): Promise<T & { attempts: number }> {
  let last: (T & { attempts: number }) | null = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let result: T;
    try {
      result = await fn();
    } catch (e) {
      result = {
        ok: false,
        status: 0,
        error: e instanceof Error ? e.message : String(e),
      } as T;
    }
    last = { ...result, attempts: attempt };
    if (result.ok || !isTransientStatus(result.status) || attempt === MAX_ATTEMPTS) {
      if (attempt > 1) {
        logInvalidate({
          level: result.ok ? 'info' : 'warn',
          stage: 'retry-final',
          upstream: label,
          attempt,
          ok: result.ok,
          status: result.status,
        });
      }
      return last;
    }
    // Exponential backoff with full jitter: delay ∈ [0, BASE * 2^(n-1)].
    const cap = BASE_DELAY_MS * 2 ** (attempt - 1);
    const delay = Math.floor(Math.random() * cap);
    logInvalidate({
      level: 'warn',
      stage: 'retry',
      upstream: label,
      attempt,
      nextDelayMs: delay,
      status: result.status,
      error: result.error,
    });
    await new Promise((r) => setTimeout(r, delay));
  }
  return last as T & { attempts: number };
}

async function purgeCloudflare(urls: string[]) {
  return timed(async () =>
    withRetry('cloudflare', async () => {
      const token = process.env.CLOUDFLARE_API_TOKEN;
      if (!token) return { ok: false, status: 0, error: 'CLOUDFLARE_API_TOKEN missing' };
      const res = await fetch(
        `https://api.cloudflare.com/client/v4/zones/${CF_ZONE_ID}/purge_cache`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ files: urls }),
          signal: AbortSignal.timeout(10_000),
        },
      );
      return { ok: res.ok, status: res.status };
    }),
  );
}

async function recachePrerender(urls: string[]) {
  const token = process.env.PRERENDER_TOKEN;
  if (!token) {
    const missing = { ok: false, status: 0, error: 'PRERENDER_TOKEN missing', durationMs: 0, attempts: 0 };
    return { ok: false, desktop: missing, mobile: missing };
  }

  const post = (adaptiveType: 'desktop' | 'mobile') =>
    timed(async () =>
      withRetry(`prerender-${adaptiveType}`, async () => {
        const res = await fetch('https://api.prerender.io/recache', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Prerender-Token': token,
          },
          body: JSON.stringify({ prerenderToken: token, urls, adaptiveType }),
          signal: AbortSignal.timeout(10_000),
        });
        return { ok: res.ok, status: res.status };
      }),
    );

  const [desktop, mobile] = await Promise.all([post('desktop'), post('mobile')]);
  return { ok: desktop.ok && mobile.ok, desktop, mobile };
}

export async function invalidateProductCacheFromServer(
  input: ProductCacheInvalidationInput = {},
): Promise<InvalidationResult> {
  const urls = productCacheUrls(input);
  const reason = input.reason ?? 'server-mutation';
  const requestId = makeRequestId();
  const now = Date.now();
  pruneIdempotency(now);

  const idempotencyKey = buildIdempotencyKey(reason, urls);
  const existing = idempotencyCache.get(idempotencyKey);

  if (existing) {
    existing.hits += 1;
    logInvalidate({
      level: 'info',
      stage: 'dedupe',
      requestId,
      idempotencyKey,
      attempt: existing.hits,
      reason,
      ageMs: now - existing.firstSeen,
    });
    if (existing.result) {
      return { ...existing.result, requestId, attempt: existing.hits, deduped: true };
    }
    if (existing.inflight) {
      const r = await existing.inflight;
      return { ...r, requestId, attempt: existing.hits, deduped: true };
    }
  }

  const record: IdempotencyRecord = existing ?? { key: idempotencyKey, firstSeen: now, hits: 1 };
  if (!existing) idempotencyCache.set(idempotencyKey, record);

  logInvalidate({
    level: 'info',
    stage: 'start',
    requestId,
    idempotencyKey,
    attempt: record.hits,
    reason,
    urlCount: urls.length,
  });

  const startedAt = Date.now();
  const work = (async (): Promise<InvalidationResult> => {
    const [cloudflare, prerender] = await Promise.all([
      purgeCloudflare(urls),
      recachePrerender(urls),
    ]);
    const result: InvalidationResult = {
      ok: cloudflare.ok && prerender.ok,
      urls: urls.length,
      cloudflare,
      prerender,
      reason,
      requestId,
      idempotencyKey,
      attempt: record.hits,
      deduped: false,
      timestamp: new Date().toISOString(),
    };
    logInvalidate({
      level: result.ok ? 'info' : 'warn',
      stage: 'complete',
      requestId,
      idempotencyKey,
      attempt: record.hits,
      reason,
      durationMs: Date.now() - startedAt,
      cloudflare: { ok: cloudflare.ok, status: cloudflare.status, durationMs: cloudflare.durationMs },
      prerenderDesktop: {
        ok: prerender.desktop.ok,
        status: prerender.desktop.status,
        durationMs: prerender.desktop.durationMs,
      },
      prerenderMobile: {
        ok: prerender.mobile.ok,
        status: prerender.mobile.status,
        durationMs: prerender.mobile.durationMs,
      },
    });
    return result;
  })();

  record.inflight = work;
  try {
    const r = await work;
    record.result = r;
    return r;
  } finally {
    record.inflight = undefined;
  }
}

/**
 * Test-only: clear the in-process idempotency cache. Exported under a
 * `__test` prefix to discourage non-test callers.
 */
export function __testResetIdempotency(): void {
  idempotencyCache.clear();
}
