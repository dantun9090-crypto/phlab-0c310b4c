import type { QueryClient } from '@tanstack/react-query';
import { getAllOrders, type Order } from '@/lib/firebase';

/**
 * Shared cache for the admin "all orders" dataset.
 *
 * Five admin tabs (Orders, Invoices, Customers, Compliance, Revenue) each used
 * to download the ENTIRE orders collection on every mount — five full
 * Firestore reads for a single admin session. fetchQuery dedupes concurrent
 * requests and serves fresh-enough data from the cache, so switching tabs is
 * instant and costs zero additional reads.
 */
export const ALL_ORDERS_QUERY_KEY = ['admin', 'all-orders'] as const;

/** Data younger than this is served from cache instead of the network. */
export const ALL_ORDERS_STALE_MS = 30_000;

/** Cached fetch: deduped; served from cache while fresh (tab switches, mounts). */
export const fetchAllOrders = (qc: QueryClient): Promise<Order[]> =>
  qc.fetchQuery({
    queryKey: ALL_ORDERS_QUERY_KEY,
    queryFn: getAllOrders,
    staleTime: ALL_ORDERS_STALE_MS,
  });

/**
 * Hard refresh: always hits Firestore (manual "Refresh" / "Retry" buttons).
 * Writes the fresh result into the same cache entry, so every other tab sees
 * the new data too.
 */
export const refetchAllOrders = (qc: QueryClient): Promise<Order[]> =>
  qc.fetchQuery({
    queryKey: ALL_ORDERS_QUERY_KEY,
    queryFn: getAllOrders,
    staleTime: 0,
  });
