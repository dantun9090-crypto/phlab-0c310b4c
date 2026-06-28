/**
 * Credential redaction for downloadable JSON payloads.
 *
 * Pulled out of `CompoundQueriesTab.tsx` so it can be unit-tested and
 * reused by `CompoundNegativesAuditTab` to redact bulk downloads.
 *
 * Always scrubs (never leaves the browser as plaintext):
 *  - Firebase `idToken` / OAuth `access_token` / `refresh_token` / `id_token`
 *  - `Authorization`, `developer-token`, `x-goog-api-key`, `client_secret`,
 *    `apikey`, `x-connection-api-key`, `login-customer-id` (header keys)
 *  - `Bearer <...>` strings anywhere in any string value
 *  - Bare JWT-shaped tokens (`xxx.yyy.zzz`, eyJ... prefix)
 *  - Google Ads customer IDs in `customers/<digits>/...` resource paths
 *
 * Always preserves:
 *  - `correlationId` (so traces still line up against the audit log)
 *  - Document structure, key order, non-sensitive values
 */

const SENSITIVE_KEYS = new Set([
  'idtoken',
  'authorization',
  'access_token',
  'refresh_token',
  'id_token',
  'developer-token',
  'developertoken',
  'x-goog-api-key',
  'client_secret',
  'clientsecret',
  'apikey',
  'api_key',
  'x-connection-api-key',
  'login-customer-id',
]);

function redactString(s: string): string {
  return s
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [REDACTED]')
    .replace(/\bey[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, '[REDACTED_JWT]')
    .replace(/customers\/\d{6,}/g, 'customers/[REDACTED_CID]');
}

function walk(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(walk);
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      if (SENSITIVE_KEYS.has(k.toLowerCase())) {
        out[k] = '[REDACTED]';
      } else {
        out[k] = walk(val);
      }
    }
    return out;
  }
  if (typeof v === 'string') return redactString(v);
  return v;
}

/** Redact a JSON string. Returns input unchanged if it's not valid JSON. */
export function redactSensitiveJson(input: string): string {
  let obj: unknown;
  try {
    obj = JSON.parse(input);
  } catch {
    return input;
  }
  return JSON.stringify(walk(obj), null, 2);
}

/** Redact any in-memory value and return a JSON string. */
export function redactSensitiveValue(value: unknown): string {
  return JSON.stringify(walk(value), null, 2);
}
