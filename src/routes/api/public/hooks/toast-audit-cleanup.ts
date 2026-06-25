/**
 * TTL cleanup for the `toastAuditLogs` collection.
 *
 * - Triggered by pg_cron (daily) — POST with header `x-cleanup-secret: <CLEANUP_SECRET>`.
 * - Retention is read from Firestore doc `settings/toastAudit.retentionDays`
 *   (admin-configurable). Defaults to 30 days. Clamped to [1, 365].
 * - Body may override retention for a single run: `{ "days": 14 }`.
 *
 * Uses the Firebase service account to call Firestore REST directly
 * (bypasses security rules). Modeled on /api/public/hooks/security-cleanup.
 */
import { createFileRoute } from '@tanstack/react-router';
import { timingSafeEqualStr } from '@/lib/timing-safe-equal';
import { enforceRateLimit } from '@/lib/rate-limit';

interface ServiceAccount {
  client_email: string;
  private_key: string;
  project_id: string;
}

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SCOPE = 'https://www.googleapis.com/auth/datastore';
const COLLECTION = 'toastAuditLogs';
const DEFAULT_DAYS = 30;
const MIN_DAYS = 1;
const MAX_DAYS = 365;
const MAX_BATCHES = 10; // up to 200 * 10 = 2000 deletions per run

function b64url(input: ArrayBuffer | string): string {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : new Uint8Array(input);
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function pemToPkcs8(pem: string): ArrayBuffer {
  const body = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s+/g, '');
  const bin = atob(body);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}

async function getAccessToken(acct: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claim = { iss: acct.client_email, scope: SCOPE, aud: TOKEN_URL, iat: now, exp: now + 3600 };
  const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(claim))}`;
  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToPkcs8(acct.private_key),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(signingInput));
  const jwt = `${signingInput}.${b64url(sig)}`;
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  });
  if (!res.ok) throw new Error(`OAuth exchange failed: ${res.status}`);
  const data = (await res.json()) as { access_token: string; expires_in: number };
  return data.access_token;
}

/**
 * Read `settings/toastAudit` document and extract retentionDays.
 * Returns undefined if the doc/field is missing.
 */
async function readRetentionDays(acct: ServiceAccount, token: string): Promise<number | undefined> {
  try {
    const url = `https://firestore.googleapis.com/v1/projects/${acct.project_id}/databases/(default)/documents/settings/toastAudit`;
    const res = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
    if (!res.ok) return undefined;
    const doc = (await res.json()) as { fields?: Record<string, any> };
    const f = doc.fields?.retentionDays;
    if (!f) return undefined;
    const n = Number(f.integerValue ?? f.doubleValue);
    return Number.isFinite(n) ? n : undefined;
  } catch {
    return undefined;
  }
}

async function cleanupCollection(
  acct: ServiceAccount,
  token: string,
  cutoffMs: number,
): Promise<number> {
  const cutoffIso = new Date(cutoffMs).toISOString();
  const queryUrl = `https://firestore.googleapis.com/v1/projects/${acct.project_id}/databases/(default)/documents:runQuery`;
  const commitUrl = `https://firestore.googleapis.com/v1/projects/${acct.project_id}/databases/(default)/documents:commit`;

  let deleted = 0;
  for (let i = 0; i < MAX_BATCHES; i++) {
    const res = await fetch(queryUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({
        structuredQuery: {
          from: [{ collectionId: COLLECTION }],
          where: {
            fieldFilter: {
              field: { fieldPath: 'timestamp' },
              op: 'LESS_THAN',
              value: { timestampValue: cutoffIso },
            },
          },
          orderBy: [{ field: { fieldPath: 'timestamp' }, direction: 'ASCENDING' }],
          limit: 200,
        },
      }),
    });
    if (!res.ok) break;
    const rows = (await res.json()) as Array<{ document?: { name: string } }>;
    const names = rows.map((r) => r.document?.name).filter((n): n is string => !!n);
    if (names.length === 0) break;

    const writes = names.map((docName) => ({ delete: docName }));
    const commitRes = await fetch(commitUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ writes }),
    });
    if (!commitRes.ok) break;
    deleted += names.length;
    if (names.length < 200) break;
  }
  return deleted;
}

export const Route = createFileRoute('/api/public/hooks/toast-audit-cleanup')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const ENDPOINT = '/api/public/hooks/toast-audit-cleanup';

        const limited = await enforceRateLimit(request, ENDPOINT, {
          limit: 30,
          windowMs: 60_000,
          retryAfterSec: 120,
        });
        if (limited) return limited;

        const expected = process.env.CLEANUP_SECRET;
        const provided = request.headers.get('x-cleanup-secret');
        if (!expected || !provided || !timingSafeEqualStr(provided, expected)) {
          const badAuthLimited = await enforceRateLimit(request, ENDPOINT, {
            limit: 10,
            windowMs: 60_000,
            retryAfterSec: 120,
            bucketKind: 'bad-auth',
          });
          if (badAuthLimited) return badAuthLimited;
          return new Response('Unauthorized', { status: 401 });
        }

        const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
        if (!raw) {
          return Response.json({ ok: false, error: 'service account missing' }, { status: 500 });
        }
        const acct = JSON.parse(raw) as ServiceAccount;
        const token = await getAccessToken(acct);

        // Optional override via request body, otherwise read admin setting,
        // otherwise fall back to DEFAULT_DAYS.
        let overrideDays: number | undefined;
        try {
          const body = await request.json().catch(() => ({})) as { days?: number };
          if (body && typeof body.days === 'number' && Number.isFinite(body.days)) {
            overrideDays = body.days;
          }
        } catch { /* noop */ }

        const settingDays = await readRetentionDays(acct, token);
        const requestedDays = overrideDays ?? settingDays ?? DEFAULT_DAYS;
        const days = Math.max(MIN_DAYS, Math.min(MAX_DAYS, Math.floor(requestedDays)));
        const cutoff = Date.now() - days * 86_400_000;

        let deleted = 0;
        let errorMsg: string | null = null;
        try {
          deleted = await cleanupCollection(acct, token, cutoff);
        } catch (e: any) {
          errorMsg = e?.message || 'cleanup failed';
        }

        return Response.json({
          ok: errorMsg === null,
          collection: COLLECTION,
          retentionDays: days,
          source: overrideDays !== undefined ? 'request' : settingDays !== undefined ? 'settings' : 'default',
          deleted,
          error: errorMsg,
        });
      },
    },
  },
});
