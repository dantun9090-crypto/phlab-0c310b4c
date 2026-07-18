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

// ---------------------------------------------------------------------------
// Structured logging
// ---------------------------------------------------------------------------
// Every request gets a short request ID and every log line is a single JSON
// object with a consistent shape. Errors are serialised with name/message/
// stack + cause so Worker/ESM runtime failures show the exact failure point
// in Cloudflare tail logs and downstream aggregation.
type LogLevel = 'debug' | 'info' | 'warn' | 'error';

function newRequestId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID().slice(0, 8);
    }
  } catch {
    /* fall through */
  }
  return Math.random().toString(36).slice(2, 10);
}

function serializeError(err: unknown): Record<string, unknown> {
  if (err instanceof Error) {
    const out: Record<string, unknown> = {
      name: err.name,
      message: err.message,
      stack: err.stack,
    };
    // Preserve cause chain (ESM runtime often wraps native failures).
    const cause = (err as { cause?: unknown }).cause;
    if (cause !== undefined) out.cause = serializeError(cause);
    // Preserve Firestore/gRPC style codes when present.
    for (const k of ['code', 'status', 'details'] as const) {
      const v = (err as Record<string, unknown>)[k];
      if (v !== undefined) out[k] = v;
    }
    return out;
  }
  if (typeof err === 'object' && err !== null) {
    try {
      return { message: JSON.stringify(err) };
    } catch {
      return { message: String(err) };
    }
  }
  return { message: String(err) };
}

interface LogContext {
  requestId: string;
  route: string;
}

function createLogger(ctx: LogContext) {
  const emit = (level: LogLevel, msg: string, fields?: Record<string, unknown>) => {
    const line = {
      ts: new Date().toISOString(),
      level,
      route: ctx.route,
      requestId: ctx.requestId,
      msg,
      ...(fields ?? {}),
    };
    const serialized = (() => {
      try {
        return JSON.stringify(line);
      } catch {
        return JSON.stringify({ ...line, unserializable: true });
      }
    })();
    const sink =
      level === 'error' ? console.error :
      level === 'warn' ? console.warn :
      level === 'debug' ? console.debug :
      console.log;
    sink(serialized);
  };
  return {
    info: (msg: string, fields?: Record<string, unknown>) => emit('info', msg, fields),
    warn: (msg: string, fields?: Record<string, unknown>) => emit('warn', msg, fields),
    error: (msg: string, err: unknown, fields?: Record<string, unknown>) =>
      emit('error', msg, { ...(fields ?? {}), error: serializeError(err) }),
    debug: (msg: string, fields?: Record<string, unknown>) => emit('debug', msg, fields),
  };
}

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

function cacheableJson(
  bodyStr: string,
  cacheStatus: 'HIT' | 'MISS',
  requestId: string,
): Response {
  return new Response(bodyStr, {
    status: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'public, max-age=30, s-maxage=30',
      'x-cache': cacheStatus,
      'x-request-id': requestId,
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

async function fetchRecentOrderRows(
  log: ReturnType<typeof createLogger>,
): Promise<OrderRow[]> {
  const tPrimary = Date.now();
  let byOrderDate: OrderRow[] = [];
  try {
    byOrderDate = await listDocsAdmin('orders', {
      orderBy: 'orderDate',
      direction: 'DESCENDING',
      limit: 60,
    });
    log.debug('firestore.query.ok', {
      step: 'orderBy=orderDate',
      count: byOrderDate.length,
      durationMs: Date.now() - tPrimary,
    });
  } catch (error) {
    log.error('firestore.query.failed', error, {
      step: 'orderBy=orderDate',
      durationMs: Date.now() - tPrimary,
    });
    throw error;
  }

  const tFallback = Date.now();
  let byCreatedAt: OrderRow[] = [];
  try {
    byCreatedAt = await listDocsAdmin('orders', {
      orderBy: 'createdAt',
      direction: 'DESCENDING',
      limit: 60,
    });
    log.debug('firestore.query.ok', {
      step: 'orderBy=createdAt',
      count: byCreatedAt.length,
      durationMs: Date.now() - tFallback,
    });
  } catch (error) {
    // Non-fatal: some deployments lack the createdAt index.
    log.warn('firestore.query.fallback_failed', {
      step: 'orderBy=createdAt',
      durationMs: Date.now() - tFallback,
      error: serializeError(error),
    });
  }

  const merged = new Map<string, OrderRow>();
  for (const row of [...byOrderDate, ...byCreatedAt]) merged.set(row.id, row);
  return Array.from(merged.values()).sort((a, b) => rowTime(b) - rowTime(a));
}

export const Route = createFileRoute('/api/public/live-orders')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const requestId = newRequestId();
        const log = createLogger({ requestId, route: '/api/public/live-orders' });
        const startedAt = Date.now();

        try {
          const url = new URL(request.url);
          const limit = Math.min(Math.max(Number(url.searchParams.get('limit') || 20), 1), 20);
          const debug = url.searchParams.get('debug') === '1';

          log.info('request.start', {
            method: 'GET',
            limit,
            debug,
            ua: request.headers.get('user-agent') || null,
            cf: {
              country: request.headers.get('cf-ipcountry') || null,
              ray: request.headers.get('cf-ray') || null,
            },
          });

          const limited = await enforceRateLimit(request, 'live-orders', {
            limit: 120,
            windowMs: 60_000,
            retryAfterSec: 60,
          });
          if (limited) {
            log.warn('request.rate_limited', { durationMs: Date.now() - startedAt });
            return json({ orders: [] }, 429, { 'x-request-id': requestId });
          }

          const cacheKey = `limit=${limit}`;
          const now = Date.now();
          if (!debug) {
            const cached = liveOrdersCache.get(cacheKey);
            if (cached && now - cached.timestamp < LIVE_ORDERS_CACHE_TTL_MS) {
              log.info('cache.hit', {
                cacheKey,
                ageMs: now - cached.timestamp,
                durationMs: Date.now() - startedAt,
              });
              return cacheableJson(cached.body, 'HIT', requestId);
            }
          }

          const rows = await fetchRecentOrderRows(log);

          let mapped: Array<LiveOrder | null | undefined>;
          try {
            mapped = await Promise.all(
              rows
                .filter((row) => !EXCLUDED_STATUSES.has(String(row.status || '').toLowerCase()))
                .map((row) => mapRawOrderToLive(row as Parameters<typeof mapRawOrderToLive>[0])),
            );
          } catch (error) {
            log.error('mapping.failed', error, { scanned: rows.length });
            throw error;
          }

          const orders = mapped
            .filter((order): order is LiveOrder => Boolean(order))
            .slice(0, limit);

          const bodyStr = JSON.stringify({
            orders,
            count: orders.length,
            debug: debug ? { scanned: rows.length, requestId } : undefined,
          });
          if (!debug) liveOrdersCache.set(cacheKey, { body: bodyStr, timestamp: now });

          log.info('request.ok', {
            scanned: rows.length,
            returned: orders.length,
            cache: 'MISS',
            durationMs: Date.now() - startedAt,
          });
          return cacheableJson(bodyStr, 'MISS', requestId);
        } catch (error) {
          log.error('request.failed', error, { durationMs: Date.now() - startedAt });
          return json(
            { orders: [], count: 0, requestId },
            200,
            { 'x-request-id': requestId },
          );
        }
      },
      HEAD: async () =>
        new Response(null, { status: 200, headers: { 'cache-control': 'no-store' } }),
    },
  },
});
