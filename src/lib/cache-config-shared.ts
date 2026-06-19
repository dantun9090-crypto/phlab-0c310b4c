/**
 * Shared constants for the admin-controlled HTML edge cache TTL.
 *
 * 0  => caching disabled (origin and edge serve no-store).
 * >0 => max-age (seconds) used for HTML cdn-cache-control + Cache API put.
 */

export const CACHE_TTL_OPTIONS = [
  { value: 0, label: 'Off (no cache)' },
  { value: 60, label: '60 seconds (default / safest)' },
  { value: 7 * 24 * 60 * 60, label: '7 days' },
  { value: 14 * 24 * 60 * 60, label: '14 days' },
  { value: 30 * 24 * 60 * 60, label: '30 days' },
  { value: 365 * 24 * 60 * 60, label: 'Unlimited (1 year)' },
] as const;

export const DEFAULT_HTML_TTL_SECONDS = 60;

export function isValidHtmlTtl(n: unknown): n is number {
  return (
    typeof n === 'number' &&
    Number.isFinite(n) &&
    Number.isInteger(n) &&
    CACHE_TTL_OPTIONS.some((o) => o.value === n)
  );
}
