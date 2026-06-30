import { createFileRoute } from '@tanstack/react-router';

import { mapRawOrderToLive, type LiveOrder } from '@/lib/orderFormatter';
import { listDocsAdmin } from '@/lib/server/firestore-admin';

const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 120;
const hits = new Map<string, { count: number; resetAt: number }>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const cur = hits.get(ip);
  if (!cur || cur.resetAt < now) {
    hits.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  cur.count += 1;
  return cur.count > MAX_PER_WINDOW;
}

function ipFrom(request: Request): string {
  return (
    request.headers.get('cf-connecting-ip') ||
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    'unknown'
  );
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-robots-tag': 'noindex',
    },
  });
}

export const Route = createFileRoute('/api/public/live-orders')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (rateLimited(ipFrom(request))) return json({ orders: [] }, 429);

        const url = new URL(request.url);
        const limit = Math.min(Math.max(Number(url.searchParams.get('limit') || 20), 1), 20);
        const debug = url.searchParams.get('debug') === '1';

        try {
          const rows = await listDocsAdmin('orders', {
            orderBy: 'orderDate',
            direction: 'DESCENDING',
            limit: 60,
          });

          const orders = rows
            .filter((row) => ['completed', 'paid'].includes(String(row.status || '').toLowerCase()))
            .map((row) => mapRawOrderToLive(row as Parameters<typeof mapRawOrderToLive>[0]))
            .filter((order): order is LiveOrder => Boolean(order))
            .slice(0, limit);

          return json({ orders, count: orders.length, debug: debug ? { scanned: rows.length } : undefined });
        } catch (error) {
          console.warn('[live-orders] failed', error instanceof Error ? error.message : String(error));
          return json({ orders: [], count: 0 }, 200);
        }
      },
      HEAD: async () => new Response(null, { status: 200, headers: { 'cache-control': 'no-store' } }),
    },
  },
});