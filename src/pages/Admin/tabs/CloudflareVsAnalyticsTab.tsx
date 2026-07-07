import { useMemo, useState } from 'react';
import { Loader2, RefreshCw, ArrowLeftRight, ClipboardPaste, Info } from 'lucide-react';
import { auth } from '@/lib/firebase';
import {
  getCloudflareCountryTraffic,
  type CloudflareAnalyticsResult,
} from '@/lib/cloudflare-analytics.functions';

/**
 * Compares real-human country counts from Cloudflare Bot Management against
 * a GA4 or Plausible country export (both are already bot-filtered by default:
 * GA4 auto-excludes known bots/spiders, Plausible ships with a bot filter).
 *
 * The user pastes an export from GA4 (Reports → Demographics → Country → Share
 * → CSV) or Plausible (Dashboard → Countries → Export CSV / API), and we join
 * on ISO country name to show side-by-side counts and deltas.
 *
 * No new API keys required — paste-driven so it works with either tool.
 */

const WINDOWS: Array<{ label: string; hours: number }> = [
  { label: '24h', hours: 24 },
  { label: '7d', hours: 168 },
];

type Source = 'ga4' | 'plausible';

interface ParsedRow { country: string; count: number }

/** Best-effort CSV/TSV/JSON parser for GA4 or Plausible exports. */
function parseExport(raw: string): { rows: ParsedRow[]; error: string | null } {
  const text = raw.trim();
  if (!text) return { rows: [], error: null };

  // JSON array (Plausible API returns { results: [{ country, visitors }] })
  if (text.startsWith('[') || text.startsWith('{')) {
    try {
      const j = JSON.parse(text);
      const arr: unknown[] = Array.isArray(j) ? j : Array.isArray((j as { results?: unknown[] }).results)
        ? (j as { results: unknown[] }).results
        : [];
      const rows: ParsedRow[] = [];
      for (const item of arr) {
        if (!item || typeof item !== 'object') continue;
        const r = item as Record<string, unknown>;
        const country = String(
          r.country ?? r.Country ?? r.country_name ?? r.countryName ?? r.name ?? '',
        ).trim();
        const countRaw = r.visitors ?? r.users ?? r.count ?? r.activeUsers ?? r.sessions ?? r.value;
        const count = typeof countRaw === 'number' ? countRaw : Number(String(countRaw ?? '0').replace(/[^0-9.]/g, ''));
        if (country && Number.isFinite(count)) rows.push({ country, count });
      }
      return { rows, error: rows.length ? null : 'JSON parsed but no country rows found' };
    } catch (e) {
      return { rows: [], error: e instanceof Error ? e.message : 'invalid JSON' };
    }
  }

  // CSV / TSV
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return { rows: [], error: null };
  const sep = lines[0].includes('\t') ? '\t' : ',';
  const header = lines[0].split(sep).map((c) => c.trim().toLowerCase().replace(/^"|"$/g, ''));
  const countryIdx = header.findIndex((h) => /country|region/.test(h));
  const countIdx = header.findIndex((h) => /visitor|user|session|count|active/.test(h));

  // Header row absent → assume "country,count"
  const dataLines = countryIdx === -1 ? lines : lines.slice(1);
  const cIdx = countryIdx === -1 ? 0 : countryIdx;
  const nIdx = countIdx === -1 ? 1 : countIdx;

  const rows: ParsedRow[] = [];
  for (const line of dataLines) {
    const cols = line.split(sep).map((c) => c.trim().replace(/^"|"$/g, ''));
    const country = cols[cIdx];
    const count = Number((cols[nIdx] ?? '0').replace(/[^0-9.]/g, ''));
    if (country && Number.isFinite(count) && count > 0) rows.push({ country, count });
  }
  return { rows, error: rows.length ? null : 'No numeric rows detected' };
}

/** Normalise country names so GA4 "United Kingdom" == CF "United Kingdom". */
function normCountry(s: string): string {
  const t = s.trim().toLowerCase();
  const map: Record<string, string> = {
    'uk': 'united kingdom',
    'gb': 'united kingdom',
    'great britain': 'united kingdom',
    'united states': 'united states',
    'usa': 'united states',
    'us': 'united states',
    'united states of america': 'united states',
    'czechia': 'czech republic',
    'russia': 'russian federation',
    'south korea': 'korea, republic of',
    'north korea': "korea, democratic people's republic of",
  };
  return map[t] ?? t;
}

export default function CloudflareVsAnalyticsTab() {
  const [hours, setHours] = useState(24);
  const [cf, setCf] = useState<CloudflareAnalyticsResult | null>(null);
  const [cfLoading, setCfLoading] = useState(false);
  const [cfError, setCfError] = useState<string | null>(null);

  const [source, setSource] = useState<Source>('ga4');
  const [pasted, setPasted] = useState('');
  const parsed = useMemo(() => parseExport(pasted), [pasted]);

  const loadCf = async (h = hours) => {
    setCfLoading(true);
    setCfError(null);
    try {
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) throw new Error('Sign in as admin first');
      const res = await getCloudflareCountryTraffic({ data: { idToken, hours: h } });
      setCf(res);
      if (!res.ok && res.error) setCfError(res.error);
    } catch (e) {
      setCfError(e instanceof Error ? e.message : 'load failed');
    } finally {
      setCfLoading(false);
    }
  };

  const joined = useMemo(() => {
    const cfMap = new Map<string, { display: string; human: number; total: number }>();
    for (const r of cf?.rows ?? []) {
      cfMap.set(normCountry(r.country), { display: r.country, human: r.human, total: r.total });
    }
    const gaMap = new Map<string, { display: string; count: number }>();
    for (const r of parsed.rows) {
      const key = normCountry(r.country);
      const prev = gaMap.get(key);
      gaMap.set(key, { display: r.country, count: (prev?.count ?? 0) + r.count });
    }
    const keys = new Set<string>([...cfMap.keys(), ...gaMap.keys()]);
    const rows = Array.from(keys).map((k) => {
      const c = cfMap.get(k);
      const g = gaMap.get(k);
      const cfHuman = c?.human ?? 0;
      const analytics = g?.count ?? 0;
      const delta = cfHuman - analytics;
      const ratio = analytics > 0 ? cfHuman / analytics : cfHuman > 0 ? Infinity : 0;
      return {
        country: c?.display ?? g?.display ?? k,
        cfHuman,
        cfTotal: c?.total ?? 0,
        analytics,
        delta,
        ratio,
        inBoth: !!c && !!g,
      };
    });
    rows.sort((a, b) => Math.max(b.cfHuman, b.analytics) - Math.max(a.cfHuman, a.analytics));
    return rows;
  }, [cf, parsed]);

  const cfHumanTotal = cf?.totals.human ?? 0;
  const analyticsTotal = parsed.rows.reduce((s, r) => s + r.count, 0);
  const bothCountries = joined.filter((r) => r.inBoth).length;
  // Pearson correlation across countries present in both sources.
  const correlation = useMemo(() => {
    const pairs = joined.filter((r) => r.inBoth).map((r) => [r.cfHuman, r.analytics] as const);
    if (pairs.length < 2) return null;
    const n = pairs.length;
    const mx = pairs.reduce((s, [x]) => s + x, 0) / n;
    const my = pairs.reduce((s, [, y]) => s + y, 0) / n;
    let num = 0, dx = 0, dy = 0;
    for (const [x, y] of pairs) {
      num += (x - mx) * (y - my);
      dx += (x - mx) ** 2;
      dy += (y - my) ** 2;
    }
    const denom = Math.sqrt(dx * dy);
    return denom > 0 ? num / denom : null;
  }, [joined]);

  return (
    <div className="p-6 space-y-6 text-white">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <ArrowLeftRight className="w-6 h-6 text-emerald-400" />
          Cloudflare vs GA4 / Plausible — Country Comparison
        </h1>
        <p className="text-slate-400 text-sm mt-1 max-w-3xl">
          Cross-checks Cloudflare's <strong>human</strong> traffic (Bot Management class
          {' '}<em>human</em>) against your GA4 or Plausible country export (both already
          filter bots). Big Cloudflare-only spikes = automated traffic Cloudflare
          didn't classify. Big GA4/Plausible-only spikes = client-side JS ran but
          Cloudflare classified it as bot (rare) or you're missing GA rows.
        </p>
      </div>

      {/* Cloudflare loader */}
      <section className="border-2 border-slate-700 rounded-lg bg-slate-900 p-4 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h2 className="font-semibold text-emerald-300">1. Load Cloudflare</h2>
          <div className="flex gap-2">
            {WINDOWS.map((w) => (
              <button
                key={w.hours}
                onClick={() => { setHours(w.hours); loadCf(w.hours); }}
                className={`px-3 py-2 rounded-lg border-2 text-sm ${
                  hours === w.hours
                    ? 'border-emerald-500 bg-emerald-500/10 text-emerald-300'
                    : 'border-slate-600 bg-slate-800 text-slate-300'
                }`}
              >{w.label}</button>
            ))}
            <button
              onClick={() => loadCf()}
              disabled={cfLoading}
              className="px-3 py-2 rounded-lg border-2 border-slate-600 bg-slate-800 text-sm hover:border-emerald-500 disabled:opacity-50 flex items-center gap-2"
            >
              {cfLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              {cf ? 'Refresh' : 'Fetch'}
            </button>
          </div>
        </div>
        {cfError && <div className="text-sm text-red-300">{cfError}</div>}
        {cf && (
          <div className="text-xs text-slate-400">
            {cf.rows.length} countries · {cfHumanTotal.toLocaleString('en-GB')} human requests ·
            window {new Date(cf.since).toLocaleString('en-GB')} → {new Date(cf.until).toLocaleString('en-GB')}
          </div>
        )}
      </section>

      {/* Paste export */}
      <section className="border-2 border-slate-700 rounded-lg bg-slate-900 p-4 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h2 className="font-semibold text-emerald-300 flex items-center gap-2">
            <ClipboardPaste className="w-4 h-4" /> 2. Paste GA4 or Plausible export
          </h2>
          <div className="flex gap-2">
            {(['ga4', 'plausible'] as Source[]).map((s) => (
              <button
                key={s}
                onClick={() => setSource(s)}
                className={`px-3 py-2 rounded-lg border-2 text-sm ${
                  source === s
                    ? 'border-emerald-500 bg-emerald-500/10 text-emerald-300'
                    : 'border-slate-600 bg-slate-800 text-slate-300'
                }`}
              >{s === 'ga4' ? 'GA4' : 'Plausible'}</button>
            ))}
          </div>
        </div>
        <div className="text-xs text-slate-400 flex items-start gap-2">
          <Info className="w-3 h-3 mt-0.5 flex-shrink-0" />
          {source === 'ga4' ? (
            <span>
              GA4 → Reports → User → Demographic details → Country. Click{' '}
              <em>Share this report → Download file → CSV</em>. Paste the CSV
              below. GA4 automatically excludes known bots and spiders, so this
              is your bot-filtered baseline.
            </span>
          ) : (
            <span>
              Plausible → your site → Locations → Countries. Click <em>Export CSV</em>{' '}
              or use the Stats API: <code>GET /api/v1/stats/breakdown?property=visit:country&amp;metrics=visitors</code>.
              Paste CSV or the JSON response. Plausible's bot filter is on by default.
            </span>
          )}
        </div>
        <textarea
          value={pasted}
          onChange={(e) => setPasted(e.target.value)}
          placeholder={source === 'ga4'
            ? 'Country,Active users\nUnited Kingdom,4210\nUnited States,812\n…'
            : 'country,visitors\nUnited Kingdom,4210\nGermany,120\n…\n\nor paste JSON from the Plausible API'}
          className="w-full min-h-[160px] rounded-lg border-2 border-slate-600 bg-slate-800 text-white text-sm p-3 font-mono"
        />
        <div className="text-xs text-slate-400">
          {parsed.error && <span className="text-red-300">{parsed.error}</span>}
          {!parsed.error && parsed.rows.length > 0 && (
            <span>Parsed {parsed.rows.length} countries · {analyticsTotal.toLocaleString('en-GB')} visitors</span>
          )}
        </div>
      </section>

      {/* Comparison */}
      {(cf || parsed.rows.length > 0) && (
        <section className="border-2 border-slate-700 rounded-lg bg-slate-900 overflow-hidden">
          <div className="px-4 py-3 bg-slate-800/60 flex flex-wrap justify-between items-center gap-3">
            <div className="text-sm">
              <span className="text-slate-400">Countries in both:</span>{' '}
              <strong className="text-emerald-300">{bothCountries}</strong>
              {correlation !== null && (
                <>
                  {' · '}<span className="text-slate-400">Pearson r:</span>{' '}
                  <strong className={correlation > 0.7 ? 'text-emerald-300' : correlation > 0.3 ? 'text-amber-300' : 'text-red-300'}>
                    {correlation.toFixed(3)}
                  </strong>
                </>
              )}
            </div>
            <div className="text-xs text-slate-500">
              Ratio = CF human ÷ {source === 'ga4' ? 'GA4' : 'Plausible'} visitors. ~1.0 = tight agreement; ≫1 = CF sees traffic your JS analytics missed (ad-blockers, JS off, or misclassified bots).
            </div>
          </div>
          <div className="overflow-x-auto max-h-[600px]">
            <table className="w-full text-sm">
              <thead className="bg-slate-800 text-xs uppercase text-slate-300 sticky top-0">
                <tr>
                  <th className="px-4 py-2 text-left">Country</th>
                  <th className="px-4 py-2 text-right text-emerald-300">CF human</th>
                  <th className="px-4 py-2 text-right text-slate-400">CF total</th>
                  <th className="px-4 py-2 text-right text-sky-300">{source === 'ga4' ? 'GA4' : 'Plausible'}</th>
                  <th className="px-4 py-2 text-right">Δ (CF − Analytics)</th>
                  <th className="px-4 py-2 text-right">Ratio</th>
                </tr>
              </thead>
              <tbody>
                {joined.length === 0 ? (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-500">Load Cloudflare and paste an export.</td></tr>
                ) : joined.map((r) => (
                  <tr key={r.country} className={`border-t border-slate-800 ${!r.inBoth ? 'bg-amber-500/5' : ''}`}>
                    <td className="px-4 py-2 font-medium">
                      {r.country}
                      {!r.inBoth && <span className="ml-2 text-xs text-amber-400">only in {r.cfHuman > 0 ? 'CF' : source === 'ga4' ? 'GA4' : 'Plausible'}</span>}
                    </td>
                    <td className="px-4 py-2 text-right text-emerald-300">{r.cfHuman.toLocaleString('en-GB')}</td>
                    <td className="px-4 py-2 text-right text-slate-500">{r.cfTotal.toLocaleString('en-GB')}</td>
                    <td className="px-4 py-2 text-right text-sky-300">{r.analytics.toLocaleString('en-GB')}</td>
                    <td className={`px-4 py-2 text-right ${r.delta > 0 ? 'text-amber-300' : r.delta < 0 ? 'text-red-300' : 'text-slate-500'}`}>
                      {r.delta > 0 ? '+' : ''}{r.delta.toLocaleString('en-GB')}
                    </td>
                    <td className="px-4 py-2 text-right">
                      {r.ratio === Infinity ? '∞' : r.ratio === 0 ? '—' : r.ratio.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
