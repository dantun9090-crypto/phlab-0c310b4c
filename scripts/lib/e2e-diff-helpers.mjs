/**
 * Pure helpers extracted from scripts/e2e-stale-assets.mjs so they can be
 * unit-tested deterministically (no CLI flags, no globals).
 *
 * Imported by:
 *   - scripts/e2e-stale-assets.mjs (runtime)
 *   - tests/e2e-diff-helpers.test.ts (vitest)
 */
import { createHash } from 'node:crypto';

export const DEFAULT_IGNORE_HEADERS = [
  'date', 'age', 'server-timing', 'x-request-id', 'cf-ray',
  'x-amz-cf-id', 'x-served-by', 'etag', 'last-modified',
];

export function sha256(s) {
  return createHash('sha256').update(String(s)).digest('hex');
}

/** Lowercase keys, drop ignored ones, return keys in stable sorted order. */
export function normalizeHeadersForDiff(h, ignoreSet = new Set(DEFAULT_IGNORE_HEADERS)) {
  if (!h || typeof h !== 'object') return h;
  const lower = {};
  for (const [k, v] of Object.entries(h)) {
    const lk = String(k).toLowerCase();
    if (ignoreSet.has(lk)) continue;
    lower[lk] = v;
  }
  const out = {};
  for (const k of Object.keys(lower).sort()) out[k] = lower[k];
  return out;
}

export function headersEqualNormalized(a, b, ignoreSet = new Set(DEFAULT_IGNORE_HEADERS)) {
  return JSON.stringify(normalizeHeadersForDiff(a || {}, ignoreSet))
       === JSON.stringify(normalizeHeadersForDiff(b || {}, ignoreSet));
}

/**
 * Redact / truncate / hash a body deterministically.
 * opts: { redactBodies, hashBodies, maxBodyBytes, redactedMarker }
 */
export function redactBody(body, opts = {}) {
  const {
    redactBodies = false,
    hashBodies = false,
    maxBodyBytes = 4000,
    redactedMarker = '[REDACTED]',
  } = opts;
  if (body == null) return body;
  const s = String(body);
  if (redactBodies) return hashBodies ? `sha256:${sha256(s)}` : redactedMarker;
  if (maxBodyBytes > 0 && s.length > maxBodyBytes) {
    return hashBodies
      ? `sha256:${sha256(s)} (orig ${s.length}B)`
      : s.slice(0, maxBodyBytes) + `…[truncated ${s.length - maxBodyBytes}B]`;
  }
  return s;
}
