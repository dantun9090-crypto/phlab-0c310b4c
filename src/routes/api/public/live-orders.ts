import { createFileRoute } from '@tanstack/react-router';

import { mapRawOrderToLive, type LiveOrder } from '@/lib/orderFormatter';
import { enforceRateLimit } from '@/lib/rate-limit';
import { listDocsAdmin } from '@/lib/server/firestore-admin';

type OrderRow = Record<string, unknown> & { id: string };
const EXCLUDED_STATUSES = new Set(['cancelled', 'canceled', 'refunded', 'failed', 'expired']);

// In-memory cache to shield Firestore from repeat polls (survives within a
// single Worker isolate). TTL matches the response Cache-Control so CF edge
// + browser cache line up.
const LIVE_ORDERS_CACHE_TTL_MS = 30_000;
const liveOrdersCache = new Map<string, { body: string; timestamp: number }>();

function json(body: unknown, status = 200, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-robots-tag': 'noindex',
      ...extraHeaders,
    },
  });
}

function cacheableJson(bodyStr: string, cacheStatus: 'HIT' | 'MISS'): Response {
  return new Response(bodyStr, {
    status: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'public, max-age=30, s-maxage=30',
      'x-cache': cacheStatus,
      'x-robots-tag': 'noindex',
    },
  });
}

function timeValue(value: unknown): number {
  if (!value) return 0;
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  if (typeof value === 'object' && value !== null && 'seconds' in value) {
    const seconds = (value as { seconds?: unknown }).seconds;
    return typeof seconds === 'number' ? seconds * 1000 : 0;
  }
  return 0;
}

function rowTime(row: OrderRow): number {
  return timeValue(row.orderDate) || timeValue(row.createdAt) || timeValue(row.updatedAt);
}

async function fetchRecentOrderRows(): Promise<OrderRow[]> {
  const byOrderDate = await listDocsAdmin('orders', {
    orderBy: 'orderDate',
    direction: 'DESCENDING',
    limit: 60,
  });

  let byCreatedAt: OrderRow[] = [];
  try {
    byCreatedAt = await listDocsAdmin('orders', {
      orderBy: 'createdAt',
      direction: 'DESCENDING',
      limit: 60,
    });
  } catch (error) {
    console.warn('[live-orders] createdAt fallback failed', error instanceof Error ? error.message : String(error));
  }

  const merged = new Map<string, OrderRow>();
  for (const row of [...byOrderDate, ...byCreatedAt]) merged.set(row.id, row);
  return Array.from(merged.values()).sort((a, b) => rowTime(b) - rowTime(a));
}

function rowUid(row: OrderRow): string | undefined {
  const customer = row.customer as { uid?: string } | undefined;
  return customer?.uid || (typeof row.userId === 'string' ? row.userId : undefined);
}

export const Route = createFileRoute('/api/public/live-orders')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const limited = await enforceRateLimit(request, 'live-orders', {
          limit: 120,
          windowMs: 60_000,
          retryAfterSec: 60,
        });
        if (limited) return json({ orders: [] }, 429);

        const url = new URL(request.url);
        const limit = Math.min(Math.max(Number(url.searchParams.get('limit') || 20), 1), 20);
        const debug = url.searchParams.get('debug') === '1';

        const cacheKey = `limit=${limit}`;
        const now = Date.now();
        if (!debug) {
          const cached = liveOrdersCache.get(cacheKey);
          if (cached && now - cached.timestamp < LIVE_ORDERS_CACHE_TTL_MS) {
            return cacheableJson(cached.body, 'HIT');
          }
        }

        try {
          const rows = await fetchRecentOrderRows();

          const orders = rows
            .filter((row) => !EXCLUDED_STATUSES.has(String(row.status || '').toLowerCase()))
            .map((row) => mapRawOrderToLive(row as Parameters<typeof mapRawOrderToLive>[0]))
            .filter((order): order is LiveOrder => Boolean(order))
            .slice(0, limit);

          const bodyStr = JSON.stringify({
            orders,
            count: orders.length,
            debug: debug ? { scanned: rows.length } : undefined,
          });
          if (!debug) liveOrdersCache.set(cacheKey, { body: bodyStr, timestamp: now });
          return cacheableJson(bodyStr, 'MISS');
        } catch (error) {
          console.warn('[live-orders] failed', error instanceof Error ? error.message : String(error));
          return json({ orders: [], count: 0 }, 200);
        }
      },
      HEAD: async () => new Response(null, { status: 200, headers: { 'cache-control': 'no-store' } }),
    },
  },
});