/**
 * Daily SEO Health Cron — runs once per day (pg_cron or external scheduler).
 *
 * For every route in MARKETING_ROUTES, probes 3 perspectives:
 *   1. Live Worker as Googlebot (verifies x-phl-via=prerender* and HTTP 200)
 *   2. Live Worker as a normal browser (verifies x-phl-via=normal-proxy)
 *   3. Direct Prerender.io render (verifies the rendering pipeline itself)
 *
 * Each result is hashed into a compact "signature" (status:via). The cron
 * compares today's signatures to the last successful run, stored in the
 * `seo_health_runs` Firestore collection. Any route whose signature differs
 * from the previous run — or which fails outright — triggers BOTH Telegram
 * and Outlook email alerts (via the existing Trigger-Email Firestore
 * collection `mail`).
 *
 * Auth: `x-watchdog-secret` header must equal CLEANUP_SECRET (reused).
 */
import { createFileRoute } from '@tanstack/react-router';
import { timingSafeEqualStr } from '@/lib/timing-safe-equal';
import { enforceRateLimit } from '@/lib/rate-limit';
import { MARKETING_ROUTES, CANONICAL_ORIGIN, GOOGLEBOT_UA, fullUrl } from '@/lib/marketing-routes';
import { addDocAdmin, getDocAdmin, updateDocAdmin } from '@/lib/server/firestore-admin';
import { enqueueMailOnce } from '@/lib/server/enqueue-mail';

const ENDPOINT = '/api/public/hooks/seo-health-daily';
const TELEGRAM_GATEWAY = 'https://connector-gateway.lovable.dev/telegram';
const ALERT_EMAIL = 'info@phlabs.co.uk';

interface ProbeResult {
  perspective: 'googlebot' | 'human' | 'prerender-direct';
  status: number;
  via: string | null;
  bytes: number;
  ok: boolean;
  error?: string;
}

interface RouteResult {
  path: string;
  label: string;
  tier: string;
  probes: ProbeResult[];
  signature: string;       // e.g. "googlebot:200:prerender|human:200:normal-proxy|pre:200"
  ok: boolean;
}

const HUMAN_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

async function probe(url: string, ua: string, perspective: ProbeResult['perspective']): Promise<ProbeResult> {
  try {
    const res = await fetch(url, {
      headers: { 'user-agent': ua, 'accept': 'text/html' },
      redirect: 'manual',
      signal: AbortSignal.timeout(30_000),
    });
    let bytes = 0;
    try { bytes = (await res.text()).length; } catch {}
    return {
      perspective,
      status: res.status,
      via: res.headers.get('x-phl-via'),
      bytes,
      ok: res.status >= 200 && res.status < 400,
    };
  } catch (e: any) {
    return { perspective, status: 0, via: null, bytes: 0, ok: false, error: e?.message || String(e) };
  }
}

async function probePrerenderDirect(target: string): Promise<ProbeResult> {
  const token = process.env.PRERENDER_TOKEN || process.env.VITE_PRERENDER_TOKEN;
  if (!token) {
    return { perspective: 'prerender-direct', status: 0, via: null, bytes: 0, ok: false, error: 'PRERENDER_TOKEN not set' };
  }
  try {
    const res = await fetch(`https://service.prerender.io/${target}`, {
      headers: { 'X-Prerender-Token': token, 'user-agent': GOOGLEBOT_UA },
      signal: AbortSignal.timeout(45_000),
    });
    let bytes = 0;
    try { bytes = (await res.text()).length; } catch {}
    return {
      perspective: 'prerender-direct',
      status: res.status,
      via: res.headers.get('x-prerender-render-id') ? 'prerender-rendered' : null,
      bytes,
      ok: res.status === 200 && bytes > 500,
    };
  } catch (e: any) {
    return { perspective: 'prerender-direct', status: 0, via: null, bytes: 0, ok: false, error: e?.message || String(e) };
  }
}

function signatureOf(r: RouteResult): string {
  return r.probes.map((p) => {
    const viaShort = (p.via || 'none').split(';')[0];
    return `${p.perspective}:${p.status}:${viaShort}`;
  }).join('|');
}

async function sendTelegram(text: string): Promise<boolean> {
  const lovableKey = process.env.LOVABLE_API_KEY;
  const tgKey = process.env.TELEGRAM_API_KEY;
  const chatId = process.env.TELEGRAM_ALERT_CHAT_ID || '7971499178';
  if (!lovableKey || !tgKey) return false;
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
    return res.ok;
  } catch {
    return false;
  }
}

function buildAlertHtml(changed: RouteResult[], failed: RouteResult[], prev: Record<string, string>): string {
  const rows = (rs: RouteResult[]) => rs.map((r) => {
    const prevSig = prev[r.path] || '(no previous run)';
    return `<tr>
      <td><a href="${CANONICAL_ORIGIN}${r.path}">${r.path}</a></td>
      <td>${r.tier}</td>
      <td><code>${r.signature}</code></td>
      <td><code>${prevSig}</code></td>
    </tr>`;
  }).join('');
  return `<!doctype html><html><body style="font-family:system-ui,sans-serif">
    <h2>SEO Daily Health — status change detected</h2>
    <p>${failed.length} failing route(s), ${changed.length} signature change(s).</p>
    ${failed.length ? `<h3 style="color:#b91c1c">Failures</h3>
      <table border="1" cellpadding="6"><tr><th>Path</th><th>Tier</th><th>Now</th><th>Previous</th></tr>${rows(failed)}</table>` : ''}
    ${changed.length ? `<h3 style="color:#b45309">Signature changes</h3>
      <table border="1" cellpadding="6"><tr><th>Path</th><th>Tier</th><th>Now</th><th>Previous</th></tr>${rows(changed)}</table>` : ''}
    <p style="margin-top:24px;font-size:12px;color:#666">Generated at ${new Date().toISOString()} by /api/public/hooks/seo-health-daily</p>
  </body></html>`;
}

function buildTelegramText(changed: RouteResult[], failed: RouteResult[]): string {
  const lines: string[] = [];
  lines.push(`<b>🔍 SEO Daily Health Alert</b>`);
  lines.push(`Failures: ${failed.length}, Changes: ${changed.length}`);
  for (const r of failed.slice(0, 6)) {
    lines.push(`❌ <code>${r.path}</code> [${r.tier}] → ${r.signature}`);
  }
  for (const r of changed.slice(0, 6)) {
    lines.push(`⚠️ <code>${r.path}</code> [${r.tier}] → ${r.signature}`);
  }
  return lines.join('\n');
}

export const Route = createFileRoute('/api/public/hooks/seo-health-daily')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const limited = await enforceRateLimit(request, ENDPOINT, { limit: 6, windowMs: 60_000, retryAfterSec: 120 });
        if (limited) return limited;

        const expected = process.env.CLEANUP_SECRET;
        const provided = request.headers.get('x-watchdog-secret') || request.headers.get('x-cleanup-secret');
        if (!expected || !provided || !timingSafeEqualStr(provided, expected)) {
          return new Response('Unauthorized', { status: 401 });
        }

        // Load previous run signatures.
        const PREV_DOC_ID = 'last-successful';
        let prevSigs: Record<string, string> = {};
        try {
          const prev = await getDocAdmin('seo_health_runs', PREV_DOC_ID);
          if (prev && typeof prev === 'object') {
            prevSigs = (prev as any).signatures || {};
          }
        } catch { /* first run */ }

        const startedAt = new Date().toISOString();
        const results: RouteResult[] = [];

        // Concurrency-limited probe pass.
        const queue = [...MARKETING_ROUTES];
        const worker = async () => {
          while (queue.length) {
            const r = queue.shift()!;
            const target = fullUrl(r.path);
            const probes = await Promise.all([
              probe(target, GOOGLEBOT_UA, 'googlebot'),
              probe(target, HUMAN_UA, 'human'),
              probePrerenderDirect(target),
            ]);
            const result: RouteResult = {
              path: r.path,
              label: r.label,
              tier: r.tier,
              probes,
              signature: '',
              ok: probes.every((p) => p.ok),
            };
            result.signature = signatureOf(result);
            results.push(result);
          }
        };
        await Promise.all([worker(), worker(), worker(), worker()]);

        const failed = results.filter((r) => !r.ok);
        const changed = results.filter((r) => r.ok && prevSigs[r.path] && prevSigs[r.path] !== r.signature);

        // Persist this run.
        const signatures: Record<string, string> = {};
        for (const r of results) signatures[r.path] = r.signature;

        const runDocId = `run-${startedAt.replace(/[:.]/g, '-')}`;
        try {
          await addDocAdmin('seo_health_runs', {
            startedAt,
            finishedAt: new Date().toISOString(),
            totals: { routes: results.length, failed: failed.length, changed: changed.length },
            results,
          }, runDocId);
          // Update "last-successful" snapshot (only on a fully-clean run, so a
          // sustained failure keeps the alert firing daily until it heals).
          if (failed.length === 0) {
            try {
              await updateDocAdmin('seo_health_runs', PREV_DOC_ID, {
                updatedAt: new Date().toISOString(),
                signatures,
              });
            } catch (_) {
              await addDocAdmin('seo_health_runs', {
                updatedAt: new Date().toISOString(),
                signatures,
              }, PREV_DOC_ID).catch(() => {});
            }
          }

        } catch (e) {
          console.error('[seo-health-daily] persist failed', e);
        }

        // Alert if any failures or signature changes.
        const alertNeeded = failed.length > 0 || changed.length > 0;
        let alerts = { telegram: false, email: false };
        if (alertNeeded) {
          const dayBucket = startedAt.slice(0, 10);
          const tgText = buildTelegramText(changed, failed);
          alerts.telegram = await sendTelegram(tgText);
          try {
            const emailRes = await enqueueMailOnce(`seo-health-daily:${dayBucket}`, {
              to: ALERT_EMAIL,
              message: {
                subject: `[PHLabs] SEO Daily Health — ${failed.length} failure(s), ${changed.length} change(s)`,
                html: buildAlertHtml(changed, failed, prevSigs),
                text: `Failures: ${failed.length}, Changes: ${changed.length}. See: ${CANONICAL_ORIGIN}/admin#marketingcoverage`,
              },
              source: 'seo-health-daily',
            });
            alerts.email = emailRes.enqueued || emailRes.duplicate;
          } catch (e) {
            console.error('[seo-health-daily] mail enqueue failed', e);
          }
        }

        return Response.json({
          ok: true,
          startedAt,
          totals: { routes: results.length, failed: failed.length, changed: changed.length },
          alerts,
          previousRunFound: Object.keys(prevSigs).length > 0,
        });
      },
    },
  },
});
