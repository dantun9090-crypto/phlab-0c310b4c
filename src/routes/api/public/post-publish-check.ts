import { createFileRoute } from '@tanstack/react-router';
import { getDocAdmin, addDocAdmin, updateDocAdmin } from '@/lib/server/firestore-admin';

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

async function purgeEverything(): Promise<{ ok: boolean; status: number; error?: string }> {
  const token = process.env.CLOUDFLARE_API_TOKEN;
  if (!token) return { ok: false, status: 0, error: 'CLOUDFLARE_API_TOKEN missing' };
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
    return { ok: res.ok, status: res.status };
  } catch (e) {
    return { ok: false, status: 0, error: e instanceof Error ? e.message : String(e) };
  }
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

async function runInvalidation(buildId: string): Promise<void> {
  const started = Date.now();
  const [cf, pr] = await Promise.all([purgeEverything(), recachePrerender()]);
  // Best-effort audit log entry — never throws.
  try {
    await addDocAdmin('auditLogs', {
      kind: 'post_publish_auto_invalidation',
      buildId,
      cloudflare: cf,
      prerender: pr,
      durationMs: Date.now() - started,
      createdAt: new Date().toISOString(),
    });
  } catch {
    /* ignore */
  }
}

export const Route = createFileRoute('/api/public/post-publish-check')({
  server: {
    handlers: {
      GET: async () => {
        const currentBuildId = typeof __BUILD_ID__ === 'string' ? __BUILD_ID__ : 'unknown';

        let stored: string | null = null;
        try {
          const doc = await getDocAdmin(META_COLLECTION, META_DOC);
          stored = (doc?.lastBuildId as string | undefined) ?? null;
        } catch {
          // Firestore unreachable — fail open (no auto-purge this request).
          return Response.json({ ok: false, error: 'firestore_read_failed', buildId: currentBuildId });
        }

        if (stored === currentBuildId) {
          return Response.json({ ok: true, changed: false, buildId: currentBuildId });
        }

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
        } catch (e) {
          console.error('[post-publish-check] Firestore write failed:', e);
          return Response.json({
            ok: false,
            error: 'firestore_write_failed',
            buildId: currentBuildId,
          });
        }

        // Fire-and-forget — don't block the HTTP response on Cloudflare /
        // Prerender round-trips. Worker keeps the promise alive via waitUntil
        // when available; otherwise we still await briefly so logs surface.
        const work = runInvalidation(currentBuildId);
        // Best-effort: if Cloudflare exposes waitUntil via globalThis, use it.
        // Otherwise let the runtime keep the task alive.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const ctx = (globalThis as any).__cf_executionContext;
        if (ctx?.waitUntil) ctx.waitUntil(work);

        return Response.json({ ok: true, changed: true, buildId: currentBuildId, previous: stored });
      },
    },
  },
});
