import { createFileRoute } from '@tanstack/react-router';
import { enforceRateLimit } from '@/lib/rate-limit';

/**
 * Diagnostic: fetch a same-origin path through Cloudflare and report the
 * effective response headers, so we can verify Cloudflare is honouring the
 * origin's `s-maxage=60, stale-while-revalidate=60`.
 *
 * Alert if `staleWindowSeconds > 120` — that means CF is rewriting SWR again
 * (root cause of the June/July 2026 "blank page after deploy" incidents).
 */

const ALLOWED_PATHS = new Set(['/', '/products', '/compound', '/research', '/landing/phlabs']);

function extractDirective(header: string, name: string): number | null {
  const m = header.toLowerCase().match(new RegExp(`(?:^|,\\s*)${name}=(\\d+)`));
  return m ? Number(m[1]) : null;
}

function json(body: unknown): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-robots-tag': 'noindex',
    },
  });
}

export const Route = createFileRoute('/api/public/diag/cache-headers')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const limited = await enforceRateLimit(request, 'diag-cache-headers', {
          limit: 30,
          windowMs: 60_000,
          retryAfterSec: 60,
        });
        if (limited) return limited;

        const url = new URL(request.url);
        const targetPath = url.searchParams.get('path') || '/';
        if (!ALLOWED_PATHS.has(targetPath)) {
          return json({ error: 'path_not_allowed', allowed: [...ALLOWED_PATHS] });
        }

        // Fetch through the public origin so Cloudflare rules are exercised.
        const targetUrl = new URL(targetPath, 'https://phlabs.co.uk');
        let response: Response;
        try {
          response = await fetch(targetUrl.toString(), {
            headers: {
              'Accept': 'text/html',
              'Cache-Control': 'no-cache',
              'User-Agent': 'phlabs-diag-cache-headers/1.0',
            },
            signal: AbortSignal.timeout(10_000),
          });
        } catch (err) {
          console.warn('[diag.cache-headers] fetch failed:', err instanceof Error ? err.message : String(err));
          return json({ error: 'fetch_failed', code: 'UPSTREAM_FETCH_FAILED' });
        }

        const headers: Record<string, string> = {};
        response.headers.forEach((value, key) => { headers[key] = value; });

        const cc = headers['cache-control'] || '';
        const cdn = headers['cdn-cache-control'] || '';
        const sMaxAge = extractDirective(cc, 's-maxage');
        const swr = extractDirective(cc, 'stale-while-revalidate');
        const staleWindow = sMaxAge !== null && swr !== null ? sMaxAge + swr : null;

        return json({
          checkedPath: targetPath,
          status: response.status,
          effectiveHeaders: {
            'cache-control': cc || null,
            'cdn-cache-control': cdn || null,
            'cf-cache-status': headers['cf-cache-status'] || null,
            'x-build-id': headers['x-build-id'] || null,
            'age': headers['age'] || null,
          },
          originSends: {
            sMaxAge,
            staleWhileRevalidate: swr,
          },
          cfOverrides: {
            cdnSMaxAge: extractDirective(cdn, 's-maxage'),
            cdnSWR: extractDirective(cdn, 'stale-while-revalidate'),
          },
          staleWindowSeconds: staleWindow,
          alert: staleWindow !== null && staleWindow > 120
            ? `stale window ${staleWindow}s exceeds 120s ceiling — Cloudflare rewriting SWR`
            : null,
          timestamp: new Date().toISOString(),
        });
      },
    },
  },
});
