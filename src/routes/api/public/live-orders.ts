import { createFileRoute } from '@tanstack/react-router';

import { mapRawOrderToLive, type LiveOrder } from '@/lib/orderFormatter';
import { enforceRateLimit } from '@/lib/rate-limit';
import { listDocsAdmin } from '@/lib/server/firestore-admin';
import {
  CodedError,
  LogCode,
  safeLog,
  sanitizeRequestId,
  withTimeout,
} from '@/server/logRedact';

type OrderRow = Record<string, unknown> & { id: string };
const EXCLUDED_STATUSES = new Set(['cancelled', 'canceled', 'refunded', 'failed', 'expired']);
const ROUTE = '/api/public/live-orders';
const FIRESTORE_TIMEOUT_MS = 5_000;
const DEBUG_BODY_ENV = typeof process !== 'undefined' ? process.env?.LIVE_ORDERS_DEBUG === '1' : false;

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

function cacheableJson(bodyStr: string, cacheStatus: 'HIT' | 'MISS', requestId: string): Response {
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

async function fetchRecentOrderRows(requestId: string): Promise<OrderRow[]> {
  const tPrimary = Date.now();
  let byOrderDate: OrderRow[] = [];
  try {
    byOrderDate = await withTimeout(
      listDocsAdmin('orders', { orderBy: 'orderDate', direction: 'DESCENDING', limit: 60 }),
      FIRESTORE_TIMEOUT_MS,
      () => new CodedError(LogCode.FIRESTORE_TIMEOUT, 'firestore primary query timed out'),
    );
    safeLog({
      stage: 'firestore.query.ok',
      code: LogCode.OK,
      requestId,
      route: ROUTE,
      level: 'debug',
      step: 'orderBy=orderDate',
      count: byOrderDate.length,
      durationMs: Date.now() - tPrimary,
    });
  } catch (error) {
    const code = error instanceof CodedError ? error.code : LogCode.FIRESTORE_QUERY_FAILED;
    safeLog({
      stage: 'firestore.query.failed',
      code,
      requestId,
      route: ROUTE,
      level: 'error',
      step: 'orderBy=orderDate',
      durationMs: Date.now() - tPrimary,
      error,
    });
    throw error instanceof CodedError
      ? error
      : new CodedError(LogCode.FIRESTORE_QUERY_FAILED, 'firestore primary query failed', { cause: error });
  }

  const tFallback = Date.now();
  let byCreatedAt: OrderRow[] = [];
  try {
    byCreatedAt = await withTimeout(
      listDocsAdmin('orders', { orderBy: 'createdAt', direction: 'DESCENDING', limit: 60 }),
      FIRESTORE_TIMEOUT_MS,
      () => new CodedError(LogCode.FIRESTORE_TIMEOUT, 'firestore fallback query timed out'),
    );
    safeLog({
      stage: 'firestore.query.ok',
      code: LogCode.OK,
      requestId,
      route: ROUTE,
      level: 'debug',
      step: 'orderBy=createdAt',
      count: byCreatedAt.length,
      durationMs: Date.now() - tFallback,
    });
  } catch (error) {
    safeLog({
      stage: 'firestore.query.fallback_failed',
      code: LogCode.FIRESTORE_QUERY_FALLBACK_FAILED,
      requestId,
      route: ROUTE,
      level: 'warn',
      step: 'orderBy=createdAt',
      durationMs: Date.now() - tFallback,
      error,
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
        const requestId = sanitizeRequestId(request.headers.get('x-request-id'));
        const startedAt = Date.now();

        try {
          const url = new URL(request.url);
          const limit = Math.min(Math.max(Number(url.searchParams.get('limit') || 20), 1), 20);
          const debug = url.searchParams.get('debug') === '1';

          safeLog({
            stage: 'request.start',
            requestId,
            route: ROUTE,
            method: 'GET',
            limit,
            debug,
            ua: request.headers.get('user-agent'),
            cfCountry: request.headers.get('cf-ipcountry'),
            cfRay: request.headers.get('cf-ray'),
          });

          const limited = await enforceRateLimit(request, 'live-orders', {
            limit: 120,
            windowMs: 60_000,
            retryAfterSec: 60,
          });
          if (limited) {
            safeLog({
              stage: 'request.rate_limited',
              code: LogCode.RATE_LIMITED,
              requestId,
              route: ROUTE,
              level: 'warn',
              durationMs: Date.now() - startedAt,
            });
            return json({ orders: [], code: LogCode.RATE_LIMITED, requestId }, 429, {
              'x-request-id': requestId,
            });
          }

          const cacheKey = `limit=${limit}`;
          const now = Date.now();
          if (!debug) {
            const cached = liveOrdersCache.get(cacheKey);
            if (cached && now - cached.timestamp < LIVE_ORDERS_CACHE_TTL_MS) {
              safeLog({
                stage: 'cache.hit',
                code: LogCode.CACHE_HIT,
                requestId,
                route: ROUTE,
                cacheKey,
                ageMs: now - cached.timestamp,
                durationMs: Date.now() - startedAt,
              });
              return cacheableJson(cached.body, 'HIT', requestId);
            }
          }

          safeLog({ stage: 'firestore.query.start', requestId, route: ROUTE, level: 'debug' });
          const rows = await fetchRecentOrderRows(requestId);

          safeLog({
            stage: 'mapping.start',
            requestId,
            route: ROUTE,
            level: 'debug',
            scanned: rows.length,
          });

          let mapped: Array<LiveOrder | null | undefined>;
          try {
            mapped = await Promise.all(
              rows
                .filter((row) => !EXCLUDED_STATUSES.has(String(row.status || '').toLowerCase()))
                .map((row) => mapRawOrderToLive(row as Parameters<typeof mapRawOrderToLive>[0])),
            );
            safeLog({
              stage: 'mapping.ok',
              code: LogCode.OK,
              requestId,
              route: ROUTE,
              level: 'debug',
              scanned: rows.length,
              mapped: mapped.length,
            });
          } catch (error) {
            safeLog({
              stage: 'mapping.failed',
              code: LogCode.MAPPING_FAILED,
              requestId,
              route: ROUTE,
              level: 'error',
              scanned: rows.length,
              error,
            });
            throw new CodedError(LogCode.MAPPING_FAILED, 'failed to map order rows', { cause: error });
          }

          const orders = mapped
            .filter((order): order is LiveOrder => Boolean(order))
            .slice(0, limit);

          // Debug body — safe by default. Only stage/code/counts/durations/requestId.
          // No raw Firestore data, no field values.
          const debugBody = debug
            ? {
                requestId,
                stages: [
                  'request.start',
                  'firestore.query.start',
                  'firestore.query.ok',
                  'mapping.start',
                  'mapping.ok',
                  'response.send',
                ],
                counts: { scanned: rows.length, mapped: mapped.length, returned: orders.length },
                durationMs: Date.now() - startedAt,
                code: orders.length === 0 ? LogCode.EMPTY_RESULT : LogCode.OK,
              }
            : undefined;

          const bodyStr = JSON.stringify({
            orders,
            count: orders.length,
            ...(debugBody ? { debug: debugBody } : {}),
          });
          if (!debug) liveOrdersCache.set(cacheKey, { body: bodyStr, timestamp: now });

          safeLog({
            stage: 'response.send',
            code: orders.length === 0 ? LogCode.EMPTY_RESULT : LogCode.OK,
            requestId,
            route: ROUTE,
            scanned: rows.length,
            returned: orders.length,
            cache: 'MISS',
            durationMs: Date.now() - startedAt,
          });
          return cacheableJson(bodyStr, 'MISS', requestId);
        } catch (error) {
          const code =
            error instanceof CodedError ? error.code : LogCode.INTERNAL_ERROR;
          safeLog({
            stage: 'request.failed',
            code,
            requestId,
            route: ROUTE,
            level: 'error',
            durationMs: Date.now() - startedAt,
            error,
          });
          // Production default: minimal body. Full debug only behind explicit flag.
          const body = DEBUG_BODY_ENV
            ? { orders: [], count: 0, requestId, code, durationMs: Date.now() - startedAt }
            : { orders: [], count: 0, requestId, code };
          return json(body, 200, { 'x-request-id': requestId });
        }
      },
      HEAD: async () =>
        new Response(null, { status: 200, headers: { 'cache-control': 'no-store' } }),
    },
  },
});
