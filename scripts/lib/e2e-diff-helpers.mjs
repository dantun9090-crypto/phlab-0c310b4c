/**
 * Pure helpers extracted from scripts/e2e-stale-assets.mjs so they can be
 * unit-tested deterministically (no CLI flags, no globals).
 *
 * Imported by:
 *   - scripts/e2e-stale-assets.mjs (runtime)
 *   - scripts/lib/e2e-report-client.mjs (browser bundle JS)
 *   - tests/e2e-diff-helpers.test.ts (vitest)
 *   - tests/e2e-bundle-schema.test.ts (vitest)
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

// ──────────────────────────────────────────────────────────────────────────
// Mismatch-bundle schema + validators
//
// Two shapes are exported via the HTML report:
//   * per-scenario bundle ("mismatch-bundle-<scenario>.json")
//   * global bundle ("mismatch-bundle-all-scenarios.json" + ZIP w/ manifest)
//
// validateMismatchBundle / validateGlobalMismatchBundle return
//   { ok: boolean, errors: string[] }
// They are pure (no I/O, no globals) so the same validator runs in:
//   - the e2e script (before embedding into HTML — fail fast)
//   - vitest (tests/e2e-bundle-schema.test.ts)
//   - the Playwright UI test (after a real browser-side download)
// ──────────────────────────────────────────────────────────────────────────

export const BUNDLE_SCHEMA_VERSION = 1;
// Oldest schemaVersion this validator can still parse. Bundles in
// [MIN_SUPPORTED_SCHEMA_VERSION .. BUNDLE_SCHEMA_VERSION-1] validate with a
// warning instead of a hard error so older artifacts remain inspectable.
export const MIN_SUPPORTED_SCHEMA_VERSION = 1;

export const BUNDLE_SCHEMA = {
  perScenario: {
    required: ['schemaVersion', 'scenario', 'generatedAt', 'redaction', 'thresholds', 'summary', 'items'],
    redaction: ['redactBodies', 'hashBodies', 'maxBodyBytes', 'redactHeaders', 'redactUrlParams'],
    item: {
      required: ['match', 'url', 'index', 'reasons', 'kinds', 'resourceType', 'bodyRedacted', 'redirectChain', 'timing'],
      sideRequired: ['status', 'redirectChain', 'timing'],
      timingRequired: ['startedAt', 'durationMs'],
    },
  },
  global: {
    required: ['schemaVersion', 'generatedAt', 'redaction', 'scenarios'],
  },
};

function _isObject(o) { return o != null && typeof o === 'object' && !Array.isArray(o); }

export function validateMismatchBundle(b) {
  const errors = [];
  if (!_isObject(b)) return { ok: false, errors: ['bundle is not a JSON object'] };
  for (const k of BUNDLE_SCHEMA.perScenario.required) {
    if (!(k in b)) errors.push(`missing required field "${k}"`);
  }
  if (b.schemaVersion !== BUNDLE_SCHEMA_VERSION) {
    errors.push(`schemaVersion expected ${BUNDLE_SCHEMA_VERSION}, got ${JSON.stringify(b.schemaVersion)}`);
  }
  if (b.scenario != null && typeof b.scenario !== 'string') errors.push('scenario must be a string');
  if (b.generatedAt != null && typeof b.generatedAt !== 'string') errors.push('generatedAt must be an ISO string');
  if (b.redaction != null) {
    if (!_isObject(b.redaction)) errors.push('redaction must be an object');
    else for (const k of BUNDLE_SCHEMA.perScenario.redaction) {
      if (!(k in b.redaction)) errors.push(`redaction missing field "${k}"`);
    }
  }
  if (b.items != null) {
    if (!Array.isArray(b.items)) errors.push('items must be an array');
    else b.items.forEach((it, i) => {
      if (!_isObject(it)) { errors.push(`items[${i}] not an object`); return; }
      for (const k of BUNDLE_SCHEMA.perScenario.item.required) {
        if (!(k in it)) errors.push(`items[${i}] missing "${k}"`);
      }
      if (it.redirectChain != null && !Array.isArray(it.redirectChain)) {
        errors.push(`items[${i}].redirectChain must be an array`);
      }
      if (it.timing != null) {
        if (!_isObject(it.timing)) errors.push(`items[${i}].timing must be an object`);
        else {
          for (const side of ['fixture', 'live']) {
            const t = it.timing[side];
            if (t == null) continue;
            if (!_isObject(t)) { errors.push(`items[${i}].timing.${side} must be an object`); continue; }
            for (const k of BUNDLE_SCHEMA.perScenario.item.timingRequired) {
              if (!(k in t)) errors.push(`items[${i}].timing.${side} missing "${k}"`);
            }
          }
        }
      }

      for (const side of ['fixture', 'live']) {
        const s = it[side];
        if (s == null) continue; // null is permitted (only-live / only-fixture)
        if (!_isObject(s)) { errors.push(`items[${i}].${side} must be an object or null`); continue; }
        for (const k of BUNDLE_SCHEMA.perScenario.item.sideRequired) {
          if (!(k in s)) errors.push(`items[${i}].${side} missing "${k}"`);
        }
        if (s.timing != null && !_isObject(s.timing)) {
          errors.push(`items[${i}].${side}.timing must be an object`);
        }
        if (s.redirectChain != null && !Array.isArray(s.redirectChain)) {
          errors.push(`items[${i}].${side}.redirectChain must be an array`);
        }
      }
    });
  }
  return { ok: errors.length === 0, errors };
}

export function validateGlobalMismatchBundle(b) {
  const errors = [];
  if (!_isObject(b)) return { ok: false, errors: ['global bundle is not a JSON object'] };
  for (const k of BUNDLE_SCHEMA.global.required) {
    if (!(k in b)) errors.push(`missing required field "${k}"`);
  }
  if (b.schemaVersion !== BUNDLE_SCHEMA_VERSION) {
    errors.push(`schemaVersion expected ${BUNDLE_SCHEMA_VERSION}, got ${JSON.stringify(b.schemaVersion)}`);
  }
  if (b.scenarios != null) {
    if (!Array.isArray(b.scenarios)) errors.push('scenarios must be an array');
    else b.scenarios.forEach((sc, i) => {
      const sub = validateMismatchBundle(sc);
      if (!sub.ok) for (const e of sub.errors) errors.push(`scenarios[${i}]: ${e}`);
    });
  }
  return { ok: errors.length === 0, errors };
}
