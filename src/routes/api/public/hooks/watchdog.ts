/**
 * Watchdog Bot — runs every 5 minutes (pg_cron).
 *
 * Performs a battery of health checks against the live site, Firestore data,
 * the Wallid payments integration and product images. Writes a summary
 * document to `watchdog_runs` (admin-read only) and attempts a small set
 * of safe auto-heal actions (Prerender recache for failing sitemap, kicks
 * the Wallid monitor when stale, and enqueues an admin email when Wallid
 * failure counts rise — one alert per hour, deduped).
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

// ── Firestore value (de)serialisation (shared) ───────────────────────────
function toFsValue(v: any): any {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === 'string') return { stringValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toFsValue) } };
  if (typeof v === 'object') return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, val]) => [k, toFsValue(val)])) } };
  return { stringValue: String(v) };
}
function fromFsFields(fields: Record<string, any> | undefined): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(fields || {})) {
    if ('stringValue' in v) out[k] = v.stringValue;
    else if ('integerValue' in v) out[k] = Number(v.integerValue);
    else if ('booleanValue' in v) out[k] = v.booleanValue;
    else if ('nullValue' in v) out[k] = null;
    else if ('timestampValue' in v) out[k] = v.timestampValue;
  }
  return out;
}

async function writeRun(acct: SA, token: string, doc: Record<string, unknown>): Promise<void> {
  const url = `https://firestore.googleapis.com/v1/projects/${acct.project_id}/databases/(default)/documents/watchdog_runs`;
  await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ fields: Object.fromEntries(Object.entries(doc).map(([k, v]) => [k, toFsValue(v)])) }),
  });
}

// ── Cloudflare Dev Mode watchdog ─────────────────────────────────────────
const CF_ZONE_ID = 'ed093ef4578e8e3568e26c3e979558c6';
const DEVMODE_DOC_PATH = 'watchdog/devmode_alerts';
const TELEGRAM_GATEWAY = 'https://connector-gateway.lovable.dev/telegram';

async function getDevmodeDoc(acct: SA, token: string): Promise<Record<string, any> | null> {
  const url = `https://firestore.googleapis.com/v1/projects/${acct.project_id}/databases/(default)/documents/${DEVMODE_DOC_PATH}`;
  const res = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
  if (!res.ok) return null;
  const j = (await res.json()) as { fields?: Record<string, any> };
  return fromFsFields(j.fields);
}

async function setDevmodeDoc(acct: SA, token: string, patch: Record<string, any>): Promise<void> {
  const mask = Object.keys(patch).map((f) => `updateMask.fieldPaths=${encodeURIComponent(f)}`).join('&');
  const url = `https://firestore.googleapis.com/v1/projects/${acct.project_id}/databases/(default)/documents/${DEVMODE_DOC_PATH}?${mask}`;
  await fetch(url, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ fields: Object.fromEntries(Object.entries(patch).map(([k, v]) => [k, toFsValue(v)])) }),
  });
}

async function writeAuditLog(acct: SA, token: string, doc: Record<string, unknown>): Promise<void> {
  const url = `https://firestore.googleapis.com/v1/projects/${acct.project_id}/databases/(default)/documents/auditLogs`;
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ fields: Object.fromEntries(Object.entries(doc).map(([k, v]) => [k, toFsValue(v)])) }),
    });
  } catch { /* best-effort */ }
}

async function sendTelegramAlert(text: string): Promise<{ ok: boolean; detail: string }> {
  const lovableKey = process.env.LOVABLE_API_KEY;
  const tgKey = process.env.TELEGRAM_API_KEY;
  const chatId = process.env.TELEGRAM_ALERT_CHAT_ID || '7971499178';
  if (!lovableKey || !tgKey) {
    console.warn('[watchdog:devmode] Telegram alerting not configured — skipping');
    return { ok: false, detail: 'telegram credentials missing (degraded)' };
  }
  try {
    const res = await fetch(`${TELEGRAM_GATEWAY}/sendMessage`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableKey}`,
        'X-Connection-Api-Key': tgKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true }),
      signal: AbortSignal.timeout(10_000),
    });
    return { ok: res.ok, detail: `telegram ${res.status}` };
  } catch (e: any) {
    return { ok: false, detail: e?.message || 'telegram send failed' };
  }
}

async function checkCloudflareDevMode(acct: SA, token: string): Promise<CheckResult> {
  const t0 = Date.now();
  const nowIso = new Date().toISOString();
  try {
    const cfToken = process.env.CLOUDFLARE_API_TOKEN;
    if (!cfToken) {
      await writeAuditLog(acct, token, { kind: 'watchdog_devmode_check', at: nowIso, ok: false, detail: 'CLOUDFLARE_API_TOKEN missing' });
      return { name: 'cloudflare-devmode', ok: false, detail: 'CLOUDFLARE_API_TOKEN missing (degraded)', durationMs: Date.now() - t0 };
    }
    const cfRes = await fetch(
      `https://api.cloudflare.com/client/v4/zones/${CF_ZONE_ID}/settings/development_mode`,
      { headers: { Authorization: `Bearer ${cfToken}` }, signal: AbortSignal.timeout(15_000) },
    );
    const cfJson = (await cfRes.json()) as {
      success: boolean;
      result?: { value: 'on' | 'off'; time_remaining?: number; modified_on?: string | null };
    };
    if (!cfRes.ok || !cfJson.success || !cfJson.result) {
      await writeAuditLog(acct, token, { kind: 'watchdog_devmode_check', at: nowIso, ok: false, detail: `cf api ${cfRes.status}` });
      return { name: 'cloudflare-devmode', ok: false, detail: `cf api ${cfRes.status}`, durationMs: Date.now() - t0 };
    }

    const value = cfJson.result.value;
    const modifiedOn = cfJson.result.modified_on || null;
    const doc = (await getDevmodeDoc(acct, token)) || {};
    const patch: Record<string, any> = { lastCheckAt: nowIso };
    let detail = `dev_mode=${value}`;
    let alertOk = false;

    if (value === 'on') {
      const prevStart = doc.sessionStartedAt as string | undefined;
      const isNewSession = !prevStart || (modifiedOn && modifiedOn !== prevStart) || !!doc.turnedOffAt;
      const sessionStart = modifiedOn || prevStart || nowIso;
      if (isNewSession) {
        patch.sessionStartedAt = sessionStart;
        patch.alertSentAt = null;
        patch.escalationSentAt = null;
        patch.turnedOffAt = null;
      }
      const startMs = Date.parse(sessionStart);
      const ageMin = Number.isFinite(startMs) ? Math.round((Date.now() - startMs) / 60_000) : 0;
      detail += ` for ${ageMin}min`;

      const alreadyAlerted = !isNewSession && !!doc.alertSentAt;
      const alreadyEscalated = !isNewSession && !!doc.escalationSentAt;

      if (ageMin > 120 && !alreadyEscalated) {
        const r = await sendTelegramAlert(
          `🆘 <b>PHLabs Watchdog ESCALATION</b>\nCloudflare Dev Mode still <b>ON</b> after ${ageMin} min on phlabs.co.uk.\nAuto-expires in ~${Math.max(0, 180 - ageMin)} min → expect blank pages!\n<b>Turn off NOW</b> in Admin → Cloudflare.`,
        );
        if (r.ok) { patch.escalationSentAt = nowIso; alertOk = true; }
        detail += ` | escalation ${r.ok ? 'sent' : 'FAILED:' + r.detail}`;
      } else if (ageMin > 30 && !alreadyAlerted) {
        const r = await sendTelegramAlert(
          `🚨 <b>PHLabs Watchdog</b>\nCloudflare Dev Mode <b>ON</b> for &gt;30 min on phlabs.co.uk.\nBlank page risk after 3h auto-expiry!\nTurn off in Admin → Cloudflare panel.\n\n<i>Session started: ${sessionStart}</i>`,
        );
        if (r.ok) { patch.alertSentAt = nowIso; alertOk = true; }
        detail += ` | alert ${r.ok ? 'sent' : 'FAILED:' + r.detail}`;
      }
    } else {
      if (doc.sessionStartedAt && !doc.turnedOffAt) {
        patch.turnedOffAt = nowIso;
        detail += ' | session closed';
      }
    }

    await setDevmodeDoc(acct, token, patch);
    await writeAuditLog(acct, token, {
      kind: 'watchdog_devmode_check', at: nowIso, ok: true, value, modifiedOn, detail, alertSent: alertOk,
    });

    const ok = value === 'off' || !detail.includes('FAILED');
    return { name: 'cloudflare-devmode', ok, detail, durationMs: Date.now() - t0 };
  } catch (e: any) {
    await writeAuditLog(acct, token, { kind: 'watchdog_devmode_check', at: nowIso, ok: false, detail: e?.message || 'check threw' });
    return { name: 'cloudflare-devmode', ok: false, detail: e?.message || 'check threw', durationMs: Date.now() - t0 };
  }
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

        // ── Wallid integration health ────────────────────────────────
        let wallidErrorRate = 0;
        let wallidErrorsLastHour = 0;
        let wallidErrorsPrevHour = 0;

        checks.push(await timed('wallid-config', async () => {
          const r = await fetch(`${BASE}/api/config/payments`, { headers: { accept: 'application/json' } });
          if (!r.ok) return { ok: false, detail: `config ${r.status}` };
          const j = (await r.json().catch(() => ({}))) as any;
          const methods: string[] = Array.isArray(j?.methods) ? j.methods : Array.isArray(j?.enabled) ? j.enabled : [];
          const flat = JSON.stringify(j).toLowerCase();
          const present = methods.some((m) => String(m).toLowerCase().includes('wallid')) || flat.includes('wallid');
          return { ok: present, detail: present ? 'wallid enabled in payments config' : 'wallid MISSING from payments config' };
        }));

        checks.push(await timed('wallid-monitor-freshness', async () => {
          try {
            const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
            const { data } = await supabaseAdmin
              .from('app_config')
              .select('value, updated_at')
              .eq('key', 'wallid:last-monitor-run')
              .maybeSingle();
            if (!data) return { ok: false, detail: 'no wallid monitor run recorded yet' };
            const ts = Date.parse(String(data.updated_at || ''));
            const ageMin = ts ? Math.round((Date.now() - ts) / 60_000) : 9999;
            return { ok: ageMin <= 30, detail: `last monitor run ${ageMin} min ago${ageMin > 30 ? ' (STALE)' : ''}` };
          } catch (e: any) {
            return { ok: false, detail: e?.message || 'app_config read failed' };
          }
        }));

        checks.push(await timed('wallid-error-rate', async () => {
          try {
            const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
            const nowMs = Date.now();
            const h1 = new Date(nowMs - 60 * 60_000).toISOString();
            const h2 = new Date(nowMs - 120 * 60_000).toISOString();
            const failedStatuses = ['FAILED', 'DECLINED', 'CANCELLED', 'EXPIRED', 'ERROR'];
            const { count: lastHour } = await supabaseAdmin
              .from('wallid_payments')
              .select('*', { count: 'exact', head: true })
              .gte('created_at', h1)
              .in('status', failedStatuses);
            const { count: prevHour } = await supabaseAdmin
              .from('wallid_payments')
              .select('*', { count: 'exact', head: true })
              .gte('created_at', h2)
              .lt('created_at', h1)
              .in('status', failedStatuses);
            wallidErrorsLastHour = Number(lastHour || 0);
            wallidErrorsPrevHour = Number(prevHour || 0);
            const { count: totalLastHour } = await supabaseAdmin
              .from('wallid_payments')
              .select('*', { count: 'exact', head: true })
              .gte('created_at', h1);
            const total = Number(totalLastHour || 0);
            wallidErrorRate = total > 0 ? Math.round((wallidErrorsLastHour / total) * 100) : 0;
            const rising = wallidErrorsLastHour > wallidErrorsPrevHour && wallidErrorsLastHour >= 3;
            const tooHigh = wallidErrorRate >= 40 && total >= 5;
            const ok = !rising && !tooHigh;
            const flags = [
              rising ? `RISING (${wallidErrorsPrevHour}→${wallidErrorsLastHour})` : '',
              tooHigh ? `RATE ${wallidErrorRate}%` : '',
            ].filter(Boolean).join(' ');
            return {
              ok,
              detail: `${wallidErrorsLastHour} failed / ${total} total last hour (${wallidErrorRate}%)${flags ? ' — ' + flags : ''}`,
            };
          } catch (e: any) {
            return { ok: false, detail: e?.message || 'wallid_payments read failed' };
          }
        }));

        checks.push(await timed('wallid-webhook-events', async () => {
          try {
            const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
            const since = new Date(Date.now() - 24 * 60 * 60_000).toISOString();
            const { count } = await supabaseAdmin
              .from('wallid_webhook_events')
              .select('*', { count: 'exact', head: true })
              .gte('received_at', since);
            const n = Number(count || 0);
            return { ok: true, detail: `${n} webhook events in last 24h (informational)` };
          } catch (e: any) {
            return { ok: true, detail: e?.message || 'events table not readable' };
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

        // Auto-heal: if Wallid monitor data is stale, trigger it now.
        const monitorCheck = checks.find((c) => c.name === 'wallid-monitor-freshness');
        if (monitorCheck && !monitorCheck.ok) {
          try {
            const r = await fetch(`${BASE}/api/public/hooks/wallid-monitor`, {
              method: 'POST',
              headers: { 'content-type': 'application/json', authorization: `Bearer ${expected}` },
            });
            heals.push({ name: 'wallid-monitor', ok: r.ok, detail: `status ${r.status}` });
          } catch (e: any) {
            heals.push({ name: 'wallid-monitor', ok: false, detail: e?.message || 'failed' });
          }
        }

        // Alert when Wallid errors are rising or rate is high — enqueue one email per hour.
        const errorRateCheck = checks.find((c) => c.name === 'wallid-error-rate');
        if (errorRateCheck && !errorRateCheck.ok) {
          try {
            const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
            const { enqueueMailOnce } = await import('@/lib/server/enqueue-mail');
            const bucketHour = new Date().toISOString().slice(0, 13);
            const subject = `[PH Labs] Wallid errors rising — ${wallidErrorsLastHour} failures last hour (${wallidErrorRate}%)`;
            const text =
              `Wallid integration alert from watchdog.\n\n` +
              `Failed payments last hour: ${wallidErrorsLastHour}\n` +
              `Failed payments previous hour: ${wallidErrorsPrevHour}\n` +
              `Failure rate (last hour): ${wallidErrorRate}%\n\n` +
              `Check Admin → Wallid tabs + provider status page.`;
            await enqueueMailOnce(`watchdog-wallid-alert:${bucketHour}`, {
              to: 'orders@phlabs.co.uk',
              message: { subject, html: `<p>${text.replace(/\n/g, '<br/>')}</p>`, text },
              source: 'watchdog:wallid-alert',
            });
            heals.push({ name: 'wallid-alert-email', ok: true, detail: `enqueued for hour bucket ${bucketHour}` });
            // Best-effort: log into supabase for audit visibility.
            await supabaseAdmin.from('app_config').upsert(
              {
                key: 'watchdog:last-wallid-alert',
                value: JSON.stringify({ at: new Date().toISOString(), wallidErrorsLastHour, wallidErrorsPrevHour, wallidErrorRate }),
                updated_at: new Date().toISOString(),
              },
              { onConflict: 'key' },
            );
          } catch (e: any) {
            heals.push({ name: 'wallid-alert-email', ok: false, detail: e?.message || 'enqueue failed' });
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
          wallidErrorsLastHour,
          wallidErrorsPrevHour,
          wallidErrorRate,
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
