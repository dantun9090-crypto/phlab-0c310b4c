/**
 * Shared constants for the admin-controlled HTML edge cache TTL.
 *
 * 0  => caching disabled (origin and edge serve no-store).
 * >0 => max-age (seconds) used for HTML cdn-cache-control + Cache API put.
 *
 * IMPORTANT: We cap at 60s for HTML because a cached HTML shell referencing
 * old hashed JS chunks causes blank pages after deploy. 60s gives fast TTFB
 * (~50ms HIT) while bounding stale-asset risk.
 */

export const CACHE_TTL_OPTIONS = [
  { value: 0, label: 'Off (no cache)' },
  { value: 30, label: '30 seconds' },
  { value: 60, label: '1 minute (recommended)' },
  { value: 300, label: '5 minutes' },
  { value: 900, label: '15 minutes' },
] as const;

export const DEFAULT_HTML_TTL_SECONDS = 0;

export function isValidHtmlTtl(n: unknown): n is number {
  return (
    typeof n === 'number' &&
    Number.isFinite(n) &&
    Number.isInteger(n) &&
    CACHE_TTL_OPTIONS.some((o) => o.value === n)
  );
}

