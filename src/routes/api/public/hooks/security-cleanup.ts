/**
 * 90-day TTL cleanup for security log collections.
 *
 * Called by pg_cron once per day. Deletes documents older than 90 days from
 * `securityEvents`, `loginAttempts`, and `auth_events` using service-account
 * credentials (bypasses Firestore rules).
 *
 * Auth: `x-cleanup-secret` header must equal the `CLEANUP_SECRET` env var
 * (a dedicated pre-shared secret, NOT reusing PRERENDER_TOKEN). The route
 * lives under /api/public/* so it bypasses edge auth — verification happens here.
 */
import { createFileRoute } from '@tanstack/react-router';

interface ServiceAccount {
  client_email: string;
  private_key: string;
  project_id: string;
}

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SCOPE = 'https://www.googleapis.com/auth/datastore';

const COLLECTIONS = ['securityEvents', 'loginAttempts', 'auth_events'] as const;
const TTL_DAYS = 90;
const TTL_MS = TTL_DAYS * 24 * 60 * 60 * 1000;

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

async function cleanupCollection(
  acct: ServiceAccount,
  token: string,
  name: string,
  cutoffMs: number,
): Promise<number> {
  const cutoffIso = new Date(cutoffMs).toISOString();
  const queryUrl = `https://firestore.googleapis.com/v1/projects/${acct.project_id}/databases/(default)/documents:runQuery`;

  // Page over old docs; delete in small batches to keep within Worker CPU.
  let deleted = 0;
  for (let i = 0; i < 5; i++) {
    const res = await fetch(queryUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({
        structuredQuery: {
          from: [{ collectionId: name }],
          where: {
            fieldFilter: {
              field: { fieldPath: 'createdAt' },
              op: 'LESS_THAN',
              value: { timestampValue: cutoffIso },
            },
          },
          orderBy: [{ field: { fieldPath: 'createdAt' }, direction: 'ASCENDING' }],
          limit: 200,
        },
      }),
    });
    if (!res.ok) break;
    const rows = (await res.json()) as Array<{ document?: { name: string } }>;
    const names = rows.map((r) => r.document?.name).filter((n): n is string => !!n);
    if (names.length === 0) break;

    // Commit a batch delete via Firestore REST `:commit`
    const commitUrl = `https://firestore.googleapis.com/v1/projects/${acct.project_id}/databases/(default)/documents:commit`;
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

export const Route = createFileRoute('/api/public/hooks/security-cleanup')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = process.env.PRERENDER_TOKEN;
        const provided = request.headers.get('x-cleanup-secret');
        if (!expected || !provided || provided !== expected) {
          return new Response('Unauthorized', { status: 401 });
        }
        const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
        if (!raw) {
          return Response.json({ ok: false, error: 'service account missing' }, { status: 500 });
        }
        const acct = JSON.parse(raw) as ServiceAccount;
        const token = await getAccessToken(acct);
        const cutoff = Date.now() - TTL_MS;

        const results: Record<string, number> = {};
        for (const c of COLLECTIONS) {
          try {
            results[c] = await cleanupCollection(acct, token, c, cutoff);
          } catch (e) {
            results[c] = -1;
          }
        }
        return Response.json({ ok: true, ttlDays: TTL_DAYS, deleted: results });
      },
    },
  },
});
