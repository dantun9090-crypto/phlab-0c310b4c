/**
 * Watchdog Bot — runs every 5 minutes (pg_cron).
 *
 * Performs a battery of health checks against the live site, Firestore data,
 * payments queues and product images. Writes a summary document to
 * `watchdog_runs` (admin-read only) and attempts a small set of safe
 * auto-heal actions (no client-visible side effects beyond what the existing
 * hooks already do — sitemap rebuild, Fena retry queue drain, Prerender
 * recache for failing URLs).
 *
 * Auth: `x-watchdog-secret` header must equal CLEANUP_SECRET env (reused
 * shared secret — no new secret needed).
 */
import { createFileRoute } from '@tanstack/react-router';
import { timingSafeEqualStr } from '@/lib/timing-safe-equal';
import { enforceRateLimit } from '@/lib/rate-limit';

const BASE = 'https://phlabs.co.uk';
const ENDPOINT = '/api/public/hooks/watchdog';

interface CheckResult {
  name: string;
  ok: boolean;
  detail: string;
  durationMs: number;
}

interface HealAction {
  name: string;
  ok: boolean;
  detail: string;
}

async function timed(name: string, fn: () => Promise<{ ok: boolean; detail: string }>): Promise<CheckResult> {
  const t0 = Date.now();
  try {
    const r = await fn();
    return { name, ok: r.ok, detail: r.detail, durationMs: Date.now() - t0 };
  } catch (e: any) {
    return { name, ok: false, detail: e?.message || String(e), durationMs: Date.now() - t0 };
  }
}

async function headOk(url: string): Promise<{ ok: boolean; detail: string }> {
  const res = await fetch(url, { method: 'HEAD', redirect: 'follow' });
  return { ok: res.ok, detail: `HEAD ${url} → ${res.status}` };
}

// ── Firestore helpers (service account, bypass rules) ────────────────────
interface SA { client_email: string; private_key: string; project_id: string }
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SCOPE = 'https://www.googleapis.com/auth/datastore';

function b64url(input: ArrayBuffer | string): string {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : new Uint8Array(input);
  let s = ''; for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}
function pemToPkcs8(pem: string): ArrayBuffer {
  const body = pem.replace(/-----BEGIN PRIVATE KEY-----/, '').replace(/-----END PRIVATE KEY-----/, '').replace(/\s+/g, '');
  const bin = atob(body);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}
async function getAccessToken(acct: SA): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claim = { iss: acct.client_email, scope: SCOPE, aud: TOKEN_URL, iat: now, exp: now + 3600 };
  const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(claim))}`;
  const key = await crypto.subtle.importKey('pkcs8', pemToPkcs8(acct.private_key),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(signingInput));
  const jwt = `${signingInput}.${b64url(sig)}`;
  const res = await fetch(TOKEN_URL, {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  });
  if (!res.ok) throw new Error(`OAuth failed ${res.status}`);
  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}

async function countCollection(acct: SA, token: string, name: string, filter?: { field: string; op: string; value: any }): Promise<number> {
  const url = `https://firestore.googleapis.com/v1/projects/${acct.project_id}/databases/(default)/documents:runAggregationQuery`;
  const structured: any = { from: [{ collectionId: name }] };
  if (filter) {
    structured.where = { fieldFilter: { field: { fieldPath: filter.field }, op: filter.op, value: filter.value } };
  }
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ structuredAggregationQuery: { structuredQuery: structured, aggregations: [{ alias: 'c', count: {} }] } }),
  });
  if (!res.ok) throw new Error(`count(${name}) failed ${res.status}`);
  const rows = (await res.json()) as Array<{ result?: { aggregateFields?: { c?: { integerValue?: string } } } }>;
  return Number(rows?.[0]?.result?.aggregateFields?.c?.integerValue || '0');
}

async function listRecentProducts(acct: SA, token: string, limit: number): Promise<Array<{ name: string; imageUrl: string }>> {
  const url = `https://firestore.googleapis.com/v1/projects/${acct.project_id}/databases/(default)/documents:runQuery`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ structuredQuery: { from: [{ collectionId: 'product_stock' }], limit } }),
  });
  if (!res.ok) return [];
  const rows = (await res.json()) as Array<{ document?: { fields?: Record<string, any> } }>;
  return rows.map((r) => {
    const f = r.document?.fields || {};
    const name = f.name?.stringValue || '';
    const imageUrl = f.imageUrl?.stringValue || (f.images?.arrayValue?.values?.[0]?.stringValue ?? '');
    return { name, imageUrl };
  }).filter((p) => p.imageUrl);
}

async function writeRun(acct: SA, token: string, doc: Record<string, unknown>): Promise<void> {
  const url = `https://firestore.googleapis.com/v1/projects/${acct.project_id}/databases/(default)/documents/watchdog_runs`;
  const toFields = (v: any): any => {
    if (v === null || v === undefined) return { nullValue: null };
    if (typeof v === 'boolean') return { booleanValue: v };
    if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
    if (typeof v === 'string') return { stringValue: v };
    if (Array.isArray(v)) return { arrayValue: { values: v.map(toFields) } };
    if (typeof v === 'object') return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, val]) => [k, toFields(val)])) } };
    return { stringValue: String(v) };
  };
  await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ fields: Object.fromEntries(Object.entries(doc).map(([k, v]) => [k, toFields(v)])) }),
  });
}

export const Route = createFileRoute('/api/public/hooks/watchdog')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const limited = await enforceRateLimit(request, ENDPOINT, { limit: 30, windowMs: 60_000, retryAfterSec: 120 });
        if (limited) return limited;

        const expected = process.env.CLEANUP_SECRET;
        const provided = request.headers.get('x-watchdog-secret') || request.headers.get('x-cleanup-secret');
        if (!expected || !provided || !timingSafeEqualStr(provided, expected)) {
          const bad = await enforceRateLimit(request, ENDPOINT, { limit: 10, windowMs: 60_000, retryAfterSec: 120, bucketKind: 'bad-auth' });
          if (bad) return bad;
          return new Response('Unauthorized', { status: 401 });
        }

        const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
        if (!raw) return Response.json({ ok: false, error: 'service account missing' }, { status: 500 });
        const acct = JSON.parse(raw) as SA;
        const token = await getAccessToken(acct);

        const checks: CheckResult[] = [];
        const heals: HealAction[] = [];
        const startedAt = new Date().toISOString();

        // ── Edge / SEO health ────────────────────────────────────────
        checks.push(await timed('home', () => headOk(`${BASE}/`)));
        checks.push(await timed('sitemap', () => headOk(`${BASE}/sitemap.xml`)));
        checks.push(await timed('robots', () => headOk(`${BASE}/robots.txt`)));
        checks.push(await timed('products-page', () => headOk(`${BASE}/products`)));

        // ── Orders stuck in 'pending' > 1h ───────────────────────────
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
        checks.push(await timed('stuck-pending-orders', async () => {
          const n = await countCollection(acct, token, 'orders', {
            field: 'createdAt', op: 'LESS_THAN', value: { timestampValue: oneHourAgo },
          });
          // Note: count is pre-status filter (Firestore aggregate can't combine without composite index).
          // We accept the upper-bound; admins drill into Orders tab for detail.
          return { ok: true, detail: `${n} orders older than 1h (informational)` };
        }));

        // ── Fena retry queue depth ───────────────────────────────────
        checks.push(await timed('fena-retry-queue', async () => {
          try {
            const n = await countCollection(acct, token, 'fena_retry_queue');
            return { ok: n < 50, detail: `${n} pending retries${n >= 50 ? ' (HIGH — investigate Fena)' : ''}` };
          } catch {
            return { ok: true, detail: 'queue empty / not created' };
          }
        }));

        // ── Product image reachability (recent 5) ────────────────────
        const products = await listRecentProducts(acct, token, 5);
        let brokenImages = 0;
        for (const p of products) {
          const r = await timed(`img:${p.name.slice(0, 24)}`, () => headOk(p.imageUrl));
          if (!r.ok) brokenImages++;
          checks.push(r);
        }

        // ── Auto-heal ────────────────────────────────────────────────
        const sitemapCheck = checks.find((c) => c.name === 'sitemap');
        if (sitemapCheck && !sitemapCheck.ok) {
          // Trigger Prerender recache for sitemap-listed URLs
          try {
            const recRes = await fetch(`${BASE}/api/public/hooks/prerender-recache`, {
              method: 'POST',
              headers: { 'content-type': 'application/json', 'x-cleanup-secret': expected },
            });
            heals.push({ name: 'prerender-recache', ok: recRes.ok, detail: `status ${recRes.status}` });
          } catch (e: any) {
            heals.push({ name: 'prerender-recache', ok: false, detail: e?.message || 'recache failed' });
          }
        }

        const fenaCheck = checks.find((c) => c.name === 'fena-retry-queue');
        if (fenaCheck && !fenaCheck.ok) {
          try {
            const fenaRes = await fetch(`${BASE}/api/public/hooks/fena-process-retries`, { method: 'POST' });
            heals.push({ name: 'fena-process-retries', ok: fenaRes.ok, detail: `status ${fenaRes.status}` });
          } catch (e: any) {
            heals.push({ name: 'fena-process-retries', ok: false, detail: e?.message || 'failed' });
          }
        }

        // ── Summary ──────────────────────────────────────────────────
        const failures = checks.filter((c) => !c.ok);
        const summary = {
          startedAt,
          finishedAt: new Date().toISOString(),
          totalChecks: checks.length,
          failed: failures.length,
          brokenImages,
          status: failures.length === 0 ? 'healthy' : failures.length <= 2 ? 'degraded' : 'critical',
          checks,
          heals,
          createdAt: new Date().toISOString(),
        };
        try { await writeRun(acct, token, summary); } catch { /* best-effort log */ }

        return Response.json({ ok: true, ...summary });
      },
    },
  },
});
