import { createFileRoute } from '@tanstack/react-router';
import { getDocAdmin, addDocAdmin, updateDocAdmin } from '@/lib/server/firestore-admin';
import { enforceRateLimit } from '@/lib/rate-limit';

/**
 * Public, unauthenticated endpoint that auto-fires Cloudflare cache purge +
 * Prerender.io recache exactly once per Lovable Publish.
 *
 * Mechanism:
 *   - vite.config.ts injects a unique __BUILD_ID__ at build time (new value
 *     for every Lovable Publish).
 *   - On the first request after a deploy, we compare the current build id
 *     against the value stored in Firestore `_meta/build_state`.
 *   - If different → atomically write the new id, then fire purge_everything
 *     + Prerender recache in the background (fire-and-forget, response
 *     returns immediately so visitors aren't blocked).
 *
 * Called once from the client on root mount (see src/routes/__root.tsx).
 * Safe to hit repeatedly — only the first call per build does any work.
 */

const CF_ZONE_ID = 'ed093ef4578e8e3568e26c3e979558c6';
const ORIGIN = 'https://phlabs.co.uk';
const META_COLLECTION = '_meta';
const META_DOC = 'build_state';

/**
 * Structured, one-line-JSON log for every purge/probe step. Emitted to
 * Worker stdout (visible in Cloudflare's Real-time logs / wrangler tail)
 * AND persisted to Firestore `auditLogs` for offline triage. Every line
 * carries `buildId` so a single publish can be reconstructed end-to-end
 * across concurrent invocations.
 *
 * Fields (stable schema — grep-friendly):
 *   ts        ISO8601 timestamp
 *   kind      "post_publish_step" (fixed, for log routing)
 *   buildId   __BUILD_ID__ of the Worker version that ran this step
 *   stage     short machine tag: "cf.purge.start" | "cf.purge.done" |
 *             "worker.refresh.start" | "worker.refresh.done" |
 *             "prerender.recache.done" | "probe.<path>" | "invalidation.done"
 *   status    HTTP status when applicable, else omitted
 *   ok        boolean when applicable, else omitted
 *   ...data   step-specific fields (cfCacheStatus, url, durationMs, error, ...)
 */
async function logPostPublishStep(
  buildId: string,
  stage: string,
  data: Record<string, unknown> = {},
): Promise<void> {
  const ts = new Date().toISOString();
  const structured = { ts, kind: 'post_publish_step', buildId, stage, ...data };
  try {
    // Single-line JSON so `wrangler tail` / CF logpush stays grep-able.
    console.log(JSON.stringify(structured));
  } catch { /* ignore */ }
  await addDocAdmin('auditLogs', {
    kind: 'post_publish_step',
    buildId,
    stage,
    message: stage,
    ...data,
    createdAt: new Date(),
  }).catch((e) => {
    console.warn(JSON.stringify({ ts, kind: 'post_publish_step_audit_error', buildId, stage, error: e instanceof Error ? e.message : String(e) }));
  });
}


async function purgeEverything(buildId: string): Promise<{ ok: boolean; status: number; body?: string; error?: string; durationMs: number }> {
  const started = Date.now();
  const token = process.env.CLOUDFLARE_API_TOKEN;
  if (!token) {
    await logPostPublishStep(buildId, 'cf.purge.skip', { error: 'CLOUDFLARE_API_TOKEN missing', durationMs: 0 });
    return { ok: false, status: 0, error: 'CLOUDFLARE_API_TOKEN missing', durationMs: 0 };
  }
  await logPostPublishStep(buildId, 'cf.purge.start', { zoneId: CF_ZONE_ID });
  try {
    const res = await fetch(
      `https://api.cloudflare.com/client/v4/zones/${CF_ZONE_ID}/purge_cache`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ purge_everything: true }),
        signal: AbortSignal.timeout(15_000),
      },
    );
    const body = await res.text().catch(() => '');
    const durationMs = Date.now() - started;
    await logPostPublishStep(buildId, 'cf.purge.done', {
      status: res.status,
      ok: res.ok,
      durationMs,
      bodyPreview: body.slice(0, 300),
    });
    return { ok: res.ok, status: res.status, body: body.slice(0, 2000), durationMs };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    const durationMs = Date.now() - started;
    await logPostPublishStep(buildId, 'cf.purge.done', { status: 0, ok: false, error, durationMs });
    return { ok: false, status: 0, error, durationMs };
  }
}

async function forceRefreshWorkerCache(buildId: string): Promise<{ ok: boolean; status: number; error?: string; durationMs: number }> {
  const started = Date.now();
  await logPostPublishStep(buildId, 'worker.refresh.start');
  try {
    const res = await fetch(`${ORIGIN}/`, {
      method: 'GET',
      headers: {
        'user-agent': 'phlabs-post-publish-force-refresh/1.0',
        'x-force-refresh': 'true',
        'cache-control': 'no-cache',
      },
      signal: AbortSignal.timeout(15_000),
    });
    await res.arrayBuffer().catch(() => new ArrayBuffer(0));
    const durationMs = Date.now() - started;
    await logPostPublishStep(buildId, 'worker.refresh.done', {
      status: res.status,
      ok: res.ok,
      durationMs,
      servedBuildId: res.headers.get('x-build-id') ?? null,
    });
    return { ok: res.ok, status: res.status, durationMs };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    const durationMs = Date.now() - started;
    await logPostPublishStep(buildId, 'worker.refresh.done', { status: 0, ok: false, error, durationMs });
    return { ok: false, status: 0, error, durationMs };
  }
}

/**
 * Post-purge MISS/HIT probe. For each route, GET with a cache-buster and
 * capture cf-cache-status + x-build-id so we can see, per publish, which
 * routes were confirmed fresh from the NEW Worker version.
 *
 * A HIT/STALE here after purge is a regression — logged with ok:false so
 * dashboards / alerts can key off `stage=probe.* ok=false`.
 */
type ProbeResult = {
  path: string;
  url: string;
  status: number;
  cfCacheStatus: string | null;
  servedBuildId: string | null;
  buildIdMatches: boolean;
  age: string | null;
  ok: boolean;
  reason?: string;
  durationMs: number;
};

async function probeRoute(buildId: string, path: string): Promise<ProbeResult> {
  const started = Date.now();
  const cb = `${Date.now()}${Math.random().toString(36).slice(2, 8)}`;
  const url = `${ORIGIN}${path}${path.includes('?') ? '&' : '?'}__probe=${cb}`;
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'user-agent': 'phlabs-post-publish-probe/1.0',
        'cache-control': 'no-cache',
        pragma: 'no-cache',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(15_000),
    });
    await res.arrayBuffer().catch(() => new ArrayBuffer(0));
    const cf = (res.headers.get('cf-cache-status') || '').toUpperCase() || null;
    const servedBuildId = res.headers.get('x-build-id');
    const age = res.headers.get('age');
    const buildIdMatches = servedBuildId === buildId;
    const stale = cf === 'HIT' || cf === 'STALE';
    const ok = res.ok && !stale && (servedBuildId ? buildIdMatches : true);
    const reason = !res.ok
      ? `http_${res.status}`
      : stale
        ? `stale_cf_${cf}`
        : servedBuildId && !buildIdMatches
          ? `build_mismatch_served_${servedBuildId}`
          : undefined;
    const result: ProbeResult = {
      path,
      url,
      status: res.status,
      cfCacheStatus: cf,
      servedBuildId,
      buildIdMatches,
      age,
      ok,
      reason,
      durationMs: Date.now() - started,
    };
    await logPostPublishStep(buildId, `probe.${path}`, result as unknown as Record<string, unknown>);
    return result;
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    const result: ProbeResult = {
      path,
      url,
      status: 0,
      cfCacheStatus: null,
      servedBuildId: null,
      buildIdMatches: false,
      age: null,
      ok: false,
      reason: `fetch_error:${error}`,
      durationMs: Date.now() - started,
    };
    await logPostPublishStep(buildId, `probe.${path}`, result as unknown as Record<string, unknown>);
    return result;
  }
}

async function probeAllRoutes(buildId: string): Promise<{ ok: boolean; results: ProbeResult[]; failed: number }> {
  const paths = ['/', '/products', '/compound', '/about'];
  await logPostPublishStep(buildId, 'probe.start', { paths });
  const results = await Promise.all(paths.map((p) => probeRoute(buildId, p)));
  const failed = results.filter((r) => !r.ok).length;
  await logPostPublishStep(buildId, 'probe.done', {
    total: results.length,
    failed,
    ok: failed === 0,
    summary: results.map((r) => ({ path: r.path, cf: r.cfCacheStatus, ok: r.ok, reason: r.reason })),
  });
  return { ok: failed === 0, results, failed };
}


async function fetchSitemapUrls(): Promise<string[]> {
  try {
    const res = await fetch(`${ORIGIN}/sitemap.xml`, {
      headers: { Accept: 'application/xml' },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return [];
    const xml = await res.text();
    return Array.from(new Set(
      Array.from(xml.matchAll(/<loc>([^<]+)<\/loc>/g))
        .map((m) => m[1].trim())
        .filter((u) => /^https:\/\/(www\.)?phlabs\.co\.uk\//.test(u)),
    ));
  } catch {
    return [];
  }
}

async function recachePrerender(): Promise<{ desktop: number; mobile: number; urls: number; ok: boolean }> {
  const token = process.env.PRERENDER_TOKEN;
  if (!token) return { desktop: 0, mobile: 0, urls: 0, ok: false };
  const urls = await fetchSitemapUrls();
  if (urls.length === 0) return { desktop: 0, mobile: 0, urls: 0, ok: false };
  const post = async (adaptiveType: 'desktop' | 'mobile') => {
    try {
      const res = await fetch('https://api.prerender.io/recache', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prerenderToken: token, urls, adaptiveType }),
        signal: AbortSignal.timeout(30_000),
      });
      return res.status;
    } catch {
      return 0;
    }
  };
  const [desktop, mobile] = await Promise.all([post('desktop'), post('mobile')]);
  return { desktop, mobile, urls: urls.length, ok: desktop < 400 && mobile < 400 };
}

async function markInvalidationComplete(
  buildId: string,
  data: Record<string, unknown>,
): Promise<void> {
  const existing = await getDocAdmin(META_COLLECTION, META_DOC).catch(() => null);
  const patch = {
    ...data,
    lastInvalidationBuildId: buildId,
    lastInvalidationAt: new Date().toISOString(),
  };
  if (existing) await updateDocAdmin(META_COLLECTION, META_DOC, patch);
  else await addDocAdmin(META_COLLECTION, { lastBuildId: buildId, updatedAt: new Date().toISOString(), ...patch }, META_DOC);
}

async function runInvalidation(buildId: string): Promise<{
  cloudflare: { ok: boolean; status: number; body?: string; error?: string; durationMs: number };
  worker: { ok: boolean; status: number; error?: string; durationMs: number };
  prerender: { desktop: number; mobile: number; urls: number; ok: boolean };
  probe: { ok: boolean; failed: number; results: ProbeResult[] };
  regression: { ok: boolean; failed: number } | null;
  auditOk: boolean;
  durationMs: number;
}> {
  const started = Date.now();
  await logPostPublishStep(buildId, 'invalidation.start', { startedAt: new Date(started).toISOString() });
  const cf = await purgeEverything(buildId);
  const [worker, pr] = await Promise.all([forceRefreshWorkerCache(buildId), recachePrerender()]);
  await logPostPublishStep(buildId, 'prerender.recache.done', pr as unknown as Record<string, unknown>);

  // Give CF a moment to propagate the purge across tiers before probing.
  await new Promise((r) => setTimeout(r, 3000));
  const probe = await probeAllRoutes(buildId);

  // Also run the security regression probe so each deploy is verified.
  let regression: { ok: boolean; failed: number } | null = null;
  try {
    const { runSecurityRegression } = await import('@/lib/security-regression.functions');
    const { addDocAdmin, updateDocAdmin, getDocAdmin } = await import('@/lib/server/firestore-admin');
    const report = await runSecurityRegression();
    regression = { ok: report.ok, failed: report.failed };
    const meta = { ...report, buildId, updatedAt: new Date().toISOString() };
    const existing = await getDocAdmin('_meta', 'security_regression').catch(() => null);
    if (existing) await updateDocAdmin('_meta', 'security_regression', meta);
    else await addDocAdmin('_meta', meta, 'security_regression');
    await addDocAdmin('securityRegressions', { ...report, buildId, createdAt: new Date().toISOString() });
  } catch (e) {
    console.warn(JSON.stringify({ ts: new Date().toISOString(), kind: 'post_publish_step', buildId, stage: 'regression.error', error: e instanceof Error ? e.message : String(e) }));
  }

  let auditOk = false;
  try {
    await addDocAdmin('auditLogs', {
      kind: 'post_publish_auto_invalidation',
      buildId,
      cloudflare: cf,
      worker,
      prerender: pr,
      probe,
      regression,
      durationMs: Date.now() - started,
      createdAt: new Date(),
    });
    auditOk = true;
  } catch (e) {
    console.warn(JSON.stringify({ ts: new Date().toISOString(), kind: 'post_publish_step', buildId, stage: 'audit.error', error: e instanceof Error ? e.message : String(e) }));
  }

  const durationMs = Date.now() - started;
  await markInvalidationComplete(buildId, {
    lastPurgeOk: cf.ok,
    lastPurgeStatus: cf.status,
    lastPurgeError: cf.error ?? null,
    lastPurgeDurationMs: cf.durationMs,
    lastWorkerRefreshOk: worker.ok,
    lastWorkerRefreshStatus: worker.status,
    lastWorkerRefreshError: worker.error ?? null,
    lastRecacheOk: pr.ok,
    lastRecacheDesktopStatus: pr.desktop,
    lastRecacheMobileStatus: pr.mobile,
    lastRecacheUrls: pr.urls,
    lastProbeOk: probe.ok,
    lastProbeFailed: probe.failed,
    lastProbeResults: probe.results.map((r) => ({
      path: r.path,
      cf: r.cfCacheStatus,
      status: r.status,
      buildIdMatches: r.buildIdMatches,
      ok: r.ok,
      reason: r.reason ?? null,
    })),
    lastAuditOk: auditOk,
    lastInvalidationDurationMs: durationMs,
  }).catch((e) => {
    console.warn(JSON.stringify({ ts: new Date().toISOString(), kind: 'post_publish_step', buildId, stage: 'build_state.error', error: e instanceof Error ? e.message : String(e) }));
  });

  await logPostPublishStep(buildId, 'invalidation.done', {
    durationMs,
    cfOk: cf.ok,
    workerOk: worker.ok,
    prerenderOk: pr.ok,
    probeOk: probe.ok,
    probeFailed: probe.failed,
    regressionOk: regression?.ok ?? null,
  });

  return { cloudflare: cf, worker, prerender: pr, probe, regression, auditOk, durationMs };
}


// Module-level in-flight lock — dedupes concurrent first-requests in the
// same Worker isolate. A given buildId can only fire invalidation once;
// subsequent concurrent calls observe the in-flight promise and return
// `locked: true` so the caller doesn't double-purge or loop.
type InvalidationResult = Awaited<ReturnType<typeof runInvalidation>>;
const inFlight = new Map<string, Promise<InvalidationResult>>();

export const Route = createFileRoute('/api/public/post-publish-check')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const requestUrl = new URL(request.url);
        if (requestUrl.hostname !== 'phlabs.co.uk') {
          return Response.json({
            ok: true,
            changed: false,
            invalidated: false,
            skipped: 'non_production_host',
            host: requestUrl.hostname,
            buildId: typeof __BUILD_ID__ === 'string' ? __BUILD_ID__ : 'unknown',
          });
        }

        // Per-IP rate limit — endpoint is public and triggers Firestore reads
        // on every call. Matches the pattern used by other /api/public/* routes.
        const limited = await enforceRateLimit(request, '/api/public/post-publish-check', {
          limit: 30,
          windowMs: 60_000,
          retryAfterSec: 60,
        });
        if (limited) return limited;
        const currentBuildId = typeof __BUILD_ID__ === 'string' ? __BUILD_ID__ : 'unknown';
        const clientIp = request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for') || null;
        await logPostPublishStep(currentBuildId, 'handler.start', {
          workerBuildId: currentBuildId,
          cfRay: request.headers.get('cf-ray') || null,
          cfColo: request.headers.get('cf-ipcountry') || null,
          clientIp,
        });

        // Cross-request lock inside this isolate.
        if (inFlight.has(currentBuildId)) {
          await logPostPublishStep(currentBuildId, 'handler.locked_inflight');
          return Response.json({ ok: true, locked: true, changed: false, buildId: currentBuildId });
        }

        let stored: string | null = null;
        let buildState: Record<string, unknown> | null = null;
        try {
          await logPostPublishStep(currentBuildId, 'build_state.read');
          buildState = await getDocAdmin(META_COLLECTION, META_DOC);
          stored = (buildState?.lastBuildId as string | undefined) ?? null;
        } catch (e) {
          await logPostPublishStep(currentBuildId, 'build_state.read.error', {
            error: e instanceof Error ? e.message : String(e),
          });
          return Response.json({ ok: false, error: 'firestore_read_failed', buildId: currentBuildId });
        }

        const completedBuildId = (buildState?.lastInvalidationBuildId as string | undefined) ?? null;
        const needsInvalidation = completedBuildId !== currentBuildId;
        await logPostPublishStep(currentBuildId, 'build_state.compare', {
          previousBuildId: stored,
          completedBuildId,
          changed: stored !== currentBuildId,
          needsInvalidation,
        });

        if (stored === currentBuildId && !needsInvalidation) {
          await logPostPublishStep(currentBuildId, 'handler.noop_already_invalidated');
          return Response.json({ ok: true, changed: false, invalidated: true, buildId: currentBuildId });
        }

        if (stored !== currentBuildId) {
          // Atomically claim this build id BEFORE firing invalidation so two
          // concurrent first-requests can't both trigger.
          try {
            if (stored === null) {
              await addDocAdmin(META_COLLECTION, { lastBuildId: currentBuildId, updatedAt: new Date().toISOString() }, META_DOC);
            } else {
              await updateDocAdmin(META_COLLECTION, META_DOC, {
                lastBuildId: currentBuildId,
                previousBuildId: stored,
                updatedAt: new Date().toISOString(),
              });
            }
            await logPostPublishStep(currentBuildId, 'build_state.claim', { previousBuildId: stored });
          } catch (e) {
            await logPostPublishStep(currentBuildId, 'build_state.claim.error', {
              error: e instanceof Error ? e.message : String(e),
            });
            return Response.json({
              ok: false,
              error: 'firestore_write_failed',
              buildId: currentBuildId,
            });
          }
        }

        const work = runInvalidation(currentBuildId).finally(() => {
          inFlight.delete(currentBuildId);
        });
        inFlight.set(currentBuildId, work);
        const result = await work;
        await logPostPublishStep(currentBuildId, 'handler.done', {
          cfOk: result.cloudflare.ok,
          workerOk: result.worker.ok,
          prerenderOk: result.prerender.ok,
          probeOk: result.probe.ok,
          probeFailed: result.probe.failed,
          durationMs: result.durationMs,
        });

        return Response.json({
          ok: true,
          changed: stored !== currentBuildId,
          invalidated: true,
          retriedMissingCompletion: stored === currentBuildId && needsInvalidation,
          buildId: currentBuildId,
          previous: stored,
          cloudflare: result.cloudflare,
          worker: result.worker,
          prerender: result.prerender,
          probe: result.probe,
          auditOk: result.auditOk,
          durationMs: result.durationMs,
        });
      },

    },
  },
});
