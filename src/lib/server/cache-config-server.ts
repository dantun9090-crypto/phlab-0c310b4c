/**
 * Server-only helper that returns the current HTML edge-cache TTL set by
 * an admin in the panel. Reads `siteSettings/cacheConfig.htmlTtlSeconds`
 * from Firestore with a per-isolate in-memory cache (60s) so we don't pay
 * a Firestore round-trip on every HTML request.
 *
 * Safe to import from src/server.ts and other server-only files.
 */

import { getDocAdmin } from './firestore-admin';
import { DEFAULT_HTML_TTL_SECONDS, isValidHtmlTtl } from '../cache-config-shared';

let cached: { value: number; expiresAt: number } | null = null;
const CACHE_MS = 60_000;

export async function getHtmlTtlSeconds(): Promise<number> {
  const now = Date.now();
  if (cached && cached.expiresAt > now) return cached.value;
  let value = DEFAULT_HTML_TTL_SECONDS;
  try {
    const doc = await getDocAdmin('siteSettings', 'cacheConfig');
    const raw = doc?.htmlTtlSeconds;
    if (isValidHtmlTtl(raw)) value = raw;
  } catch {
    // Fall back to default on any Firestore error.
  }
  cached = { value, expiresAt: now + CACHE_MS };
  return value;
}

/** Drop the in-memory cache so the next call re-reads from Firestore. */
export function invalidateHtmlTtlCache() {
  cached = null;
}
