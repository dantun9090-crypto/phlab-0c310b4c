/**
 * Public endpoint that ingests client-side admin-console errors and
 * persists them to Firestore (`admin_errors`). The TabErrorBoundary
 * in src/pages/Admin/index.tsx posts here so we can see exactly which
 * tab + field crashed (e.g. `A.expiryDate.toDate is not a function`).
 *
 * Worker logs surface every POST via console.error so they show up in
 * `stack_modern--server-function-logs` immediately, without waiting on
 * Firestore.
 */
import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { addDocAdmin } from '@/lib/server/firestore-admin';
import { enforceRateLimit } from '@/lib/rate-limit';



const Body = z.object({
  tab: z.string().max(120).optional(),
  message: z.string().max(2000),
  stack: z.string().max(8000).optional(),
  componentStack: z.string().max(8000).optional(),
  field: z.string().max(200).optional(),
  url: z.string().max(2000).optional(),
  buildId: z.string().max(120).optional(),
  userAgent: z.string().max(500).optional(),
});

/**
 * Strict Origin allowlist. Parse the header as a URL and match ONLY the
 * hostname — never a substring. This blocks lookalikes such as
 * `evil-phlabs.co.uk` or `phlabs.co.uk.attacker.com` that the previous
 * unanchored regex accepted.
 */
const ALLOWED_HOST_SUFFIXES = [
  'phlabs.co.uk',
  'prohealthpeptides.co.uk', // legacy 301 origin — still issues fetches in cache
  'lovable.app',
  'lovable.dev',
  'lovable.project.com',
] as const;
const DEFAULT_ORIGIN = 'https://phlabs.co.uk';

function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return false;
  let host: string;
  try {
    const u = new URL(origin);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return false;
    host = u.hostname.toLowerCase();
  } catch {
    return false;
  }
  return ALLOWED_HOST_SUFFIXES.some(
    (suffix) => host === suffix || host.endsWith('.' + suffix),
  );
}

function cors(origin: string | null) {
  const allow = isAllowedOrigin(origin) ? (origin as string) : DEFAULT_ORIGIN;
  return {
    'access-control-allow-origin': allow,
    'access-control-allow-methods': 'POST, OPTIONS',
    'access-control-allow-headers': 'content-type',
    vary: 'origin',
  };
}

export const Route = createFileRoute('/api/public/admin-errors')({
  server: {
    handlers: {
      OPTIONS: ({ request }) =>
        new Response(null, { status: 204, headers: cors(request.headers.get('origin')) }),
      POST: async ({ request }) => {
        const headers = { ...cors(request.headers.get('origin')), 'content-type': 'application/json' };
        const limited = await enforceRateLimit(request, 'admin-errors', {
          limit: 30,
          windowMs: 60_000,
          retryAfterSec: 60,
        });
        if (limited) {
          // Preserve CORS headers on the 429 so the browser can read it.
          const merged = new Headers(limited.headers);
          for (const [k, v] of Object.entries(cors(request.headers.get('origin')))) merged.set(k, v);
          return new Response(limited.body, { status: 429, headers: merged });
        }

        let raw: unknown;
        try { raw = await request.json(); } catch { return new Response('{"ok":false,"error":"bad json"}', { status: 400, headers }); }
        const parsed = Body.safeParse(raw);
        if (!parsed.success) return new Response(JSON.stringify({ ok: false, error: 'invalid' }), { status: 400, headers });

        const ev = parsed.data;
        // Always log to worker stdout so it's visible in server-function-logs
        console.error('[admin-error]', JSON.stringify({
          tab: ev.tab, field: ev.field, message: ev.message, url: ev.url, buildId: ev.buildId,
        }));

        try {
          await addDocAdmin('admin_errors', {
            ...ev,
            createdAt: new Date().toISOString(),
          });
        } catch (e) {
          console.error('[admin-error] firestore write failed', e);
          return new Response(JSON.stringify({ ok: false, logged: true }), { status: 202, headers });
        }
        return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
      },
    },
  },
});
