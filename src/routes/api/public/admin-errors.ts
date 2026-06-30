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

function cors(origin: string | null) {
  const allow = origin && /phlabs\.co\.uk|lovable\.(app|dev|project\.com)/i.test(origin)
    ? origin
    : 'https://phlabs.co.uk';
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
