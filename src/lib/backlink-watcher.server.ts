/**
 * Backlink Watcher core — server-only.
 *
 * Pulls Semrush referring-domains + overview via the connector gateway,
 * persists to Firestore, computes diffs vs the previous run, and emits
 * Telegram + transactional-email alerts on suspicious changes.
 *
 * Never import from client bundles — this file is `.server.ts` and is
 * blocked by the client-bundle guard.
 */
import {
  addDocAdmin,
  getDocAdmin,
  updateDocAdmin,
} from '@/lib/server/firestore-admin';
import { enqueueMailOnce } from '@/lib/server/enqueue-mail';

const GATEWAY = 'https://connector-gateway.lovable.dev/semrush';
const TELEGRAM_GATEWAY = 'https://connector-gateway.lovable.dev/telegram';
const TARGET_DOMAIN = 'phlabs.co.uk';
const ALERT_EMAIL = 'info@phlabs.co.uk';
const SNAPSHOT_COLLECTION = 'backlink_snapshots';
const LATEST_DOC = 'latest';

// Heuristics for "obviously spammy" referring domains. Match conservatively —
// false positives just trigger an alert, they don't auto-disavow.
const SPAM_PATTERNS: RegExp[] = [
  /\.shop$/i,
  /seo-?(growth|boost|hub|authority)/i,
  /pbn|backlink|linkfarm/i,
  /casino|porn|escort|loan|crypto-?airdrop/i,
  /[0-9]{4,}/,                    // long digit runs in TLD-less domain
  /(buy|cheap)-?(viagra|cialis)/i,
];

const AS_DROP_ALERT_THRESHOLD = 2;
const CHURN_ALERT_THRESHOLD = 5;

export interface RefDomain {
  domain: string;
  ascore: number | null;
  backlinks_num: number | null;
  country: string | null;
  first_seen: string | null;
  last_seen: string | null;
}

export interface BacklinkSnapshot {
  fetchedAt: string;
  target: string;
  ascore: number | null;
  total: number | null;
  domains_num: number | null;
  follows_num: number | null;
  nofollows_num: number | null;
  refdomains: RefDomain[];
}

export interface BacklinkDiff {
  newDomains: RefDomain[];
  lostDomains: RefDomain[];
  ascoreDelta: number | null;
  domainsDelta: number | null;
  spamNewDomains: RefDomain[];
}

export interface BacklinkWatcherResult {
  snapshot: BacklinkSnapshot;
  diff: BacklinkDiff | null;
  alerted: { telegram: boolean; email: boolean; reasons: string[] };
  runDocId: string;
  triggeredBy: 'cron' | 'manual';
  hadPrevious: boolean;
}

function semrushHeaders(): Record<string, string> {
  const lovable = process.env.LOVABLE_API_KEY;
  const sem = process.env.SEMRUSH_API_KEY;
  if (!lovable) throw new Error('LOVABLE_API_KEY not configured');
  if (!sem) throw new Error('SEMRUSH_API_KEY not configured (Semrush connector not linked)');
  return {
    Authorization: `Bearer ${lovable}`,
    'X-Connection-Api-Key': sem,
    'Allow-Limit-Offset': 'true',
  };
}

async function gwGet(path: string, params: Record<string, string | number>): Promise<any> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) qs.set(k, String(v));
  const res = await fetch(`${GATEWAY}${path}?${qs.toString()}`, {
    headers: semrushHeaders(),
    signal: AbortSignal.timeout(25_000),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Semrush ${res.status}: ${text.slice(0, 200)}`);
  let json: any;
  try { json = JSON.parse(text); } catch { throw new Error(`Semrush invalid JSON: ${text.slice(0, 120)}`); }
  if (json && typeof json === 'object' && typeof json.error === 'string') {
    throw new Error(`Semrush ${json.status ?? ''}: ${json.error}`.trim());
  }
  return json;
}

function rowsToObjects(data: any): Array<Record<string, any>> {
  const cols: string[] = data?.data?.columnNames ?? [];
  const rows: any[][] = data?.data?.rows ?? [];
  return rows.map((r) => {
    const o: Record<string, any> = {};
    cols.forEach((c, i) => { o[c] = r[i]; });
    return o;
  });
}

function toNum(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function looksSpammy(domain: string): boolean {
  return SPAM_PATTERNS.some((re) => re.test(domain));
}

async function fetchSnapshot(): Promise<BacklinkSnapshot> {
  const [overviewRes, refdomainsRes] = await Promise.all([
    gwGet('/backlinks/backlinks_overview', {
      target: TARGET_DOMAIN,
      target_type: 'root_domain',
      export_columns: 'ascore,total,domains_num,urls_num,ips_num,follows_num,nofollows_num',
    }),
    gwGet('/backlinks/backlinks_refdomains', {
      target: TARGET_DOMAIN,
      target_type: 'root_domain',
      display_limit: 200,
      export_columns: 'domain_ascore,domain,backlinks_num,ip,country,first_seen,last_seen',
    }),
  ]);
  const ov = rowsToObjects(overviewRes)[0] ?? {};
  const refs = rowsToObjects(refdomainsRes).map((r): RefDomain => ({
    domain: String(r.domain ?? '').toLowerCase().trim(),
    ascore: toNum(r.domain_ascore),
    backlinks_num: toNum(r.backlinks_num),
    country: r.country ? String(r.country) : null,
    first_seen: r.first_seen ? String(r.first_seen) : null,
    last_seen: r.last_seen ? String(r.last_seen) : null,
  })).filter((r) => r.domain);

  return {
    fetchedAt: new Date().toISOString(),
    target: TARGET_DOMAIN,
    ascore: toNum(ov.ascore),
    total: toNum(ov.total),
    domains_num: toNum(ov.domains_num),
    follows_num: toNum(ov.follows_num),
    nofollows_num: toNum(ov.nofollows_num),
    refdomains: refs,
  };
}

function computeDiff(current: BacklinkSnapshot, previous: BacklinkSnapshot): BacklinkDiff {
  const prevSet = new Set(previous.refdomains.map((r) => r.domain));
  const curSet = new Set(current.refdomains.map((r) => r.domain));
  const newDomains = current.refdomains.filter((r) => !prevSet.has(r.domain));
  const lostDomains = previous.refdomains.filter((r) => !curSet.has(r.domain));
  const spamNewDomains = newDomains.filter((r) => looksSpammy(r.domain));
  const ascoreDelta = current.ascore != null && previous.ascore != null
    ? current.ascore - previous.ascore : null;
  const domainsDelta = current.domains_num != null && previous.domains_num != null
    ? current.domains_num - previous.domains_num : null;
  return { newDomains, lostDomains, ascoreDelta, domainsDelta, spamNewDomains };
}

async function sendTelegram(text: string): Promise<boolean> {
  const lovable = process.env.LOVABLE_API_KEY;
  const tg = process.env.TELEGRAM_API_KEY;
  const chatId = process.env.TELEGRAM_ALERT_CHAT_ID || '7971499178';
  if (!lovable || !tg) return false;
  try {
    const res = await fetch(`${TELEGRAM_GATEWAY}/sendMessage`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${lovable}`,
        'X-Connection-Api-Key': tg,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

function buildEmailHtml(
  snap: BacklinkSnapshot,
  diff: BacklinkDiff,
  reasons: string[],
): string {
  const refRow = (r: RefDomain) =>
    `<tr><td><a href="https://${r.domain}">${r.domain}</a></td><td>${r.ascore ?? '-'}</td><td>${r.backlinks_num ?? '-'}</td><td>${r.country ?? '-'}</td></tr>`;
  return `<!doctype html><html><body style="font-family:system-ui,sans-serif;max-width:720px">
    <h2>Backlink Watcher Alert — phlabs.co.uk</h2>
    <p><strong>Why this fired:</strong> ${reasons.join('; ')}</p>
    <p>Authority Score: <strong>${snap.ascore ?? '-'}</strong> (Δ ${diff.ascoreDelta ?? '0'}) ·
       Referring domains: <strong>${snap.domains_num ?? '-'}</strong> (Δ ${diff.domainsDelta ?? '0'}) ·
       Total backlinks: <strong>${snap.total ?? '-'}</strong></p>
    ${diff.spamNewDomains.length ? `<h3 style="color:#b91c1c">New domains matching spam patterns (${diff.spamNewDomains.length})</h3>
      <table border="1" cellpadding="6"><tr><th>Domain</th><th>AS</th><th>Links</th><th>CC</th></tr>${diff.spamNewDomains.map(refRow).join('')}</table>
      <p style="font-size:13px;color:#555">→ Review and add to <code>public/disavow.txt</code> if confirmed spam.</p>` : ''}
    ${diff.newDomains.length ? `<h3>All new referring domains (${diff.newDomains.length})</h3>
      <table border="1" cellpadding="6"><tr><th>Domain</th><th>AS</th><th>Links</th><th>CC</th></tr>${diff.newDomains.slice(0, 30).map(refRow).join('')}</table>` : ''}
    ${diff.lostDomains.length ? `<h3>Lost referring domains (${diff.lostDomains.length})</h3>
      <table border="1" cellpadding="6"><tr><th>Domain</th><th>AS</th><th>Links</th><th>CC</th></tr>${diff.lostDomains.slice(0, 30).map(refRow).join('')}</table>` : ''}
    <p style="margin-top:24px;font-size:12px;color:#666">Run at ${snap.fetchedAt} · See Admin → SEO → Backlink Changes</p>
  </body></html>`;
}

function buildTelegramText(
  snap: BacklinkSnapshot,
  diff: BacklinkDiff,
  reasons: string[],
): string {
  const lines: string[] = [];
  lines.push(`<b>🔗 Backlink Watcher — phlabs.co.uk</b>`);
  lines.push(reasons.join(' · '));
  lines.push(`AS: <b>${snap.ascore ?? '-'}</b> (Δ ${diff.ascoreDelta ?? 0}) · RefDomains: <b>${snap.domains_num ?? '-'}</b> (Δ ${diff.domainsDelta ?? 0})`);
  if (diff.spamNewDomains.length) {
    lines.push(`\n⚠️ <b>${diff.spamNewDomains.length} new spam-pattern domain(s):</b>`);
    diff.spamNewDomains.slice(0, 5).forEach((r) => lines.push(`• <code>${r.domain}</code>`));
  }
  if (diff.newDomains.length && !diff.spamNewDomains.length) {
    lines.push(`\n+ <b>${diff.newDomains.length} new domain(s)</b>`);
    diff.newDomains.slice(0, 5).forEach((r) => lines.push(`• <code>${r.domain}</code> (AS ${r.ascore ?? '-'})`));
  }
  if (diff.lostDomains.length) {
    lines.push(`\n− <b>${diff.lostDomains.length} lost domain(s)</b>`);
  }
  return lines.join('\n');
}

export async function runBacklinkWatcher(opts: {
  triggeredBy: 'cron' | 'manual';
}): Promise<BacklinkWatcherResult> {
  const snapshot = await fetchSnapshot();

  let previous: BacklinkSnapshot | null = null;
  try {
    const prev = await getDocAdmin(SNAPSHOT_COLLECTION, LATEST_DOC);
    if (prev && typeof prev === 'object' && Array.isArray((prev as any).refdomains)) {
      previous = prev as unknown as BacklinkSnapshot;
    }
  } catch { /* first run */ }

  const diff = previous ? computeDiff(snapshot, previous) : null;

  // Decide whether to alert.
  const reasons: string[] = [];
  if (diff) {
    if (diff.spamNewDomains.length > 0) {
      reasons.push(`${diff.spamNewDomains.length} new spam-pattern domain(s)`);
    }
    if (diff.ascoreDelta != null && diff.ascoreDelta <= -AS_DROP_ALERT_THRESHOLD) {
      reasons.push(`Authority Score dropped ${Math.abs(diff.ascoreDelta)} pts`);
    }
    if (diff.newDomains.length >= CHURN_ALERT_THRESHOLD) {
      reasons.push(`${diff.newDomains.length} new referring domain(s)`);
    }
    if (diff.lostDomains.length >= CHURN_ALERT_THRESHOLD) {
      reasons.push(`${diff.lostDomains.length} lost referring domain(s)`);
    }
  }

  // Persist.
  const runDocId = `run-${snapshot.fetchedAt.replace(/[:.]/g, '-')}`;
  try {
    await addDocAdmin(SNAPSHOT_COLLECTION, {
      ...snapshot,
      diff,
      triggeredBy: opts.triggeredBy,
      alerted: reasons.length > 0,
      reasons,
    }, runDocId);
    // Always update latest so next diff baselines against this run.
    try {
      await updateDocAdmin(SNAPSHOT_COLLECTION, LATEST_DOC, snapshot as unknown as Record<string, unknown>);
    } catch {
      await addDocAdmin(SNAPSHOT_COLLECTION, snapshot as unknown as Record<string, unknown>, LATEST_DOC).catch(() => {});
    }
  } catch (e) {
    console.error('[backlink-watcher] persist failed', e);
  }

  const alerted = { telegram: false, email: false, reasons };
  if (reasons.length > 0 && diff) {
    const dayBucket = snapshot.fetchedAt.slice(0, 10);
    alerted.telegram = await sendTelegram(buildTelegramText(snapshot, diff, reasons));
    try {
      const emailRes = await enqueueMailOnce(`backlink-watcher:${dayBucket}`, {
        to: ALERT_EMAIL,
        message: {
          subject: `[PHLabs] Backlink change — ${reasons[0]}`,
          html: buildEmailHtml(snapshot, diff, reasons),
          text: reasons.join('. ') + `. See https://phlabs.co.uk/admin#backlinkchanges`,
        },
        source: 'backlink-watcher',
      });
      alerted.email = emailRes.enqueued || emailRes.duplicate;
    } catch (e) {
      console.error('[backlink-watcher] mail enqueue failed', e);
    }
  }

  return {
    snapshot,
    diff,
    alerted,
    runDocId,
    triggeredBy: opts.triggeredBy,
    hadPrevious: previous != null,
  };
}
