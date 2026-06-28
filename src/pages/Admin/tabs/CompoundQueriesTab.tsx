import { useEffect, useMemo, useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { auth } from '@/lib/firebase';
import {
  fetchCompoundQueries,
  getCompoundThresholds,
  saveCompoundThresholds,
  listCompoundHistory,
  applyNegativesToGoogleAds,
  buildNegativesCsv,
  buildSampleNegativesCsv,
  validateThresholds,
  type CompoundThresholds,
} from '@/lib/compound-queries.functions';
import { toast } from 'sonner';

type Row = {
  query: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
  riskTokens: string[];
  deltaImpressions: number;
  deltaClicks: number;
  trending: boolean;
};

type Result = {
  siteUrl: string;
  pagePath: string;
  startDate: string;
  endDate: string;
  days: number;
  totalRows: number;
  totalImpressions: number;
  totalClicks: number;
  riskyCount: number;
  riskyTrendingCount: number;
  rows: Row[];
  fetchedAt: string;
};

type HistoryEntry = {
  pagePath?: string;
  startDate?: string;
  endDate?: string;
  totalImpressions?: number;
  totalClicks?: number;
  riskyCount?: number;
  riskyTrendingCount?: number;
  riskyTrendingQueries?: string[];
  fetchedAt?: string;
};

const CAMPAIGN_NAME_DEFAULT = 'PHLABS — Compound Search';

export default function CompoundQueriesTab() {
  const fetchFn = useServerFn(fetchCompoundQueries);
  const getThresholdsFn = useServerFn(getCompoundThresholds);
  const saveThresholdsFn = useServerFn(saveCompoundThresholds);
  const listHistoryFn = useServerFn(listCompoundHistory);
  const applyFn = useServerFn(applyNegativesToGoogleAds);

  const [data, setData] = useState<Result | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState<number>(28);
  const [page, setPage] = useState<'/compound' | '/landing/phlabs'>('/compound');
  const [filter, setFilter] = useState<'all' | 'risk' | 'trending'>('all');

  const [thresholds, setThresholds] = useState<CompoundThresholds>({
    minImpressions: 5,
    growthRatio: 0.5,
    windowDays: 28,
  });
  const [thresholdsDirty, setThresholdsDirty] = useState(false);
  const [savingThresholds, setSavingThresholds] = useState(false);

  const [proposedNegatives, setProposedNegatives] = useState<Set<string>>(new Set());
  const [campaignName, setCampaignName] = useState(CAMPAIGN_NAME_DEFAULT);
  const [campaignResourceId, setCampaignResourceId] = useState('');
  const [applyPreview, setApplyPreview] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);

  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  async function getIdToken() {
    const user = auth.currentUser;
    if (!user) throw new Error('Not signed in');
    return user.getIdToken();
  }

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const idToken = await getIdToken();
      const r = await fetchFn({ data: { idToken, days, pagePath: page } });
      setData(r as Result);
      // Auto-seed proposed negatives = risky & trending queries.
      const seed = new Set(
        (r as Result).rows
          .filter((x) => x.riskTokens.length > 0 && x.trending)
          .map((x) => x.query.trim().toLowerCase()),
      );
      setProposedNegatives(seed);
      if ((r as Result).riskyTrendingCount > 0) {
        toast.warning(
          `${(r as Result).riskyTrendingCount} high-risk queries trending — seeded into Proposed Negatives`,
        );
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      toast.error(`GSC fetch failed: ${msg}`);
    } finally {
      setLoading(false);
    }
  }

  async function loadThresholds() {
    try {
      const idToken = await getIdToken();
      const t = await getThresholdsFn({ data: { idToken } });
      setThresholds(t as CompoundThresholds);
      setDays((t as CompoundThresholds).windowDays);
      setThresholdsDirty(false);
    } catch (e) {
      toast.error(`Threshold load failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  async function saveThresholds() {
    // Client-side guardrails — fail loud before round-trip to server.
    try {
      validateThresholds(thresholds);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
      return;
    }
    setSavingThresholds(true);
    try {
      const idToken = await getIdToken();
      await saveThresholdsFn({ data: { idToken, thresholds } });
      toast.success('Thresholds saved — re-run analysis to apply');
      setThresholdsDirty(false);
    } catch (e) {
      toast.error(`Save failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSavingThresholds(false);
    }
  }

  function downloadSampleCsv() {
    const blob = new Blob([buildSampleNegativesCsv()], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'google-ads-negatives-sample.csv';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast.success('Sample CSV downloaded');
  }


  async function loadHistory() {
    setHistoryLoading(true);
    try {
      const idToken = await getIdToken();
      const r = (await listHistoryFn({ data: { idToken, limit: 60 } })) as {
        rowsJson: string;
      };
      const parsed = JSON.parse(r.rowsJson) as HistoryEntry[];
      setHistory(parsed.filter((h) => !page || h.pagePath === page));
    } catch (e) {
      toast.error(`History load failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setHistoryLoading(false);
    }
  }

  useEffect(() => {
    loadThresholds();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days, page]);

  const filtered = useMemo(() => {
    if (!data) return [];
    if (filter === 'risk') return data.rows.filter((r) => r.riskTokens.length > 0);
    if (filter === 'trending') return data.rows.filter((r) => r.trending);
    return data.rows;
  }, [data, filter]);

  function toggleNegative(q: string) {
    const key = q.trim().toLowerCase();
    setProposedNegatives((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function exportCsv() {
    if (!data) return;
    const header = 'Query,Clicks,Impressions,CTR,Position,DeltaImpressions,DeltaClicks,Trending,RiskTokens\n';
    const csv =
      header +
      data.rows
        .map((r) =>
          [
            JSON.stringify(r.query),
            r.clicks,
            r.impressions,
            (r.ctr * 100).toFixed(2) + '%',
            r.position.toFixed(1),
            r.deltaImpressions,
            r.deltaClicks,
            r.trending ? 'yes' : 'no',
            JSON.stringify(r.riskTokens.join('|')),
          ].join(','),
        )
        .join('\n');
    download(csv, `compound-queries-${page.replace(/\//g, '_')}-${data.endDate}.csv`);
  }

  function exportNegativesCsv() {
    const list = Array.from(proposedNegatives);
    if (list.length === 0) {
      toast.error('No proposed negatives selected');
      return;
    }
    const csv = buildNegativesCsv(campaignName, list);
    download(csv, `google-ads-negatives-${new Date().toISOString().slice(0, 10)}.csv`);
  }

  function download(text: string, name: string) {
    const blob = new Blob([text], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function applyDryRun() {
    await runApply(true);
  }
  async function applyLive() {
    if (!campaignResourceId.trim()) {
      toast.error('Enter Google Ads campaign ID first');
      return;
    }
    if (
      !confirm(
        `Push ${proposedNegatives.size} negative keyword(s) LIVE to campaign ${campaignResourceId}? This cannot be undone.`,
      )
    )
      return;
    await runApply(false);
  }

  function newClientCorrelationId(): string {
    return `ui-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }

  async function runApply(dryRun: boolean) {
    setApplying(true);
    setApplyPreview(null);
    const correlationId = newClientCorrelationId();
    try {
      const idToken = await getIdToken();
      const r = await applyFn({
        data: {
          idToken,
          campaignResourceId: campaignResourceId.trim() || undefined,
          negatives: Array.from(proposedNegatives),
          dryRun,
          correlationId,
        },
      });
      const json = JSON.stringify(r, null, 2);
      setApplyPreview(json);
      if ((r as { ok: boolean }).ok) {
        toast.success(
          dryRun
            ? `Dry-run ${correlationId} complete — review preview`
            : `Negatives pushed (${correlationId})`,
        );
      } else {
        toast.error(`Apply failed — see preview (${correlationId})`);
      }
    } catch (e) {
      toast.error(`Apply failed (${correlationId}): ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setApplying(false);
    }
  }

  /**
   * Scrub anything that looks like a credential before the dry-run JSON
   * leaves the browser. Keeps `correlationId` intact so the file is still
   * traceable end-to-end against the audit log.
   *
   * Redacts:
   *  - Firebase idToken / OAuth access_token / refresh_token / id_token
   *  - `Authorization`, `developer-token`, `x-goog-api-key` headers
   *  - `Bearer ...` strings anywhere in the payload
   *  - Google Ads customer IDs in `customers/<digits>/...` resource paths
   *  - Bare JWT-shaped tokens (xxx.yyy.zzz)
   */
  function redactSensitiveJson(input: string): string {
    const SENSITIVE_KEYS = new Set([
      'idtoken', 'authorization', 'access_token', 'refresh_token', 'id_token',
      'developer-token', 'developertoken', 'x-goog-api-key',
      'client_secret', 'clientsecret', 'apikey', 'api_key',
      'x-connection-api-key', 'login-customer-id',
    ]);
    let obj: unknown;
    try { obj = JSON.parse(input); } catch { return input; }
    const walk = (v: unknown): unknown => {
      if (Array.isArray(v)) return v.map(walk);
      if (v && typeof v === 'object') {
        const out: Record<string, unknown> = {};
        for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
          if (SENSITIVE_KEYS.has(k.toLowerCase())) out[k] = '[REDACTED]';
          else out[k] = walk(val);
        }
        return out;
      }
      if (typeof v === 'string') {
        return v
          .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [REDACTED]')
          .replace(/\bey[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, '[REDACTED_JWT]')
          .replace(/customers\/\d{6,}/g, 'customers/[REDACTED_CID]');
      }
      return v;
    };
    return JSON.stringify(walk(obj), null, 2);
  }

  function downloadPreviewJson() {
    if (!applyPreview) return;
    let cid = 'preview';
    try {
      const parsed = JSON.parse(applyPreview) as { correlationId?: string };
      if (parsed.correlationId) cid = parsed.correlationId;
    } catch { /* ignore */ }
    const redacted = redactSensitiveJson(applyPreview);
    const wrapped = JSON.stringify(
      {
        _note: 'Sensitive fields redacted before download. correlationId preserved for tracing.',
        correlationId: cid,
        exportedAt: new Date().toISOString(),
        payload: JSON.parse(redacted),
      },
      null,
      2,
    );
    const blob = new Blob([wrapped], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `compound-negatives-dryrun-${cid}.redacted.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast.success('Redacted preview JSON downloaded');
  }


  return (
    <div className="p-4 md:p-6 max-w-7xl">
      <header className="mb-6">
        <h2 className="text-2xl font-bold text-white">/compound Search Queries</h2>
        <p className="text-slate-400 text-sm mt-1">
          GSC queries driving impressions and clicks to{' '}
          <code className="text-emerald-400">{page}</code> over the last {days} days.
          High-risk terms are flagged. Thresholds for "trending" are configurable below.
        </p>
      </header>

      {/* Controls */}
      <div className="flex flex-wrap gap-2 mb-4 items-center">
        <select
          value={page}
          onChange={(e) => setPage(e.target.value as typeof page)}
          className="border-2 border-slate-600 bg-slate-800 text-white min-h-[40px] rounded-lg px-3 text-sm"
        >
          <option value="/compound">/compound</option>
          <option value="/landing/phlabs">/landing/phlabs</option>
        </select>
        <select
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
          className="border-2 border-slate-600 bg-slate-800 text-white min-h-[40px] rounded-lg px-3 text-sm"
        >
          <option value={7}>Last 7 days</option>
          <option value={28}>Last 28 days</option>
          <option value={90}>Last 90 days</option>
        </select>
        <div className="flex gap-1">
          {(['all', 'risk', 'trending'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-2 rounded-lg text-xs font-semibold ${
                filter === f ? 'bg-emerald-600 text-white' : 'bg-slate-700 text-slate-200'
              }`}
            >
              {f === 'all' ? 'All' : f === 'risk' ? 'High-risk only' : 'Trending only'}
            </button>
          ))}
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-semibold"
        >
          {loading ? '⏳ Loading…' : '↻ Refresh'}
        </button>
        <button
          onClick={exportCsv}
          disabled={!data}
          className="bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-white px-3 py-2 rounded-lg text-xs"
        >
          ⬇ CSV (queries)
        </button>
      </div>

      {/* Thresholds editor */}
      <details className="mb-4 rounded-xl border-2 border-slate-700 bg-slate-900 p-4">
        <summary className="cursor-pointer text-white font-semibold">
          ⚙ Detection thresholds
        </summary>
        <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
          <NumberField
            label="Min impressions (current window)"
            value={thresholds.minImpressions}
            onChange={(v) => {
              setThresholds({ ...thresholds, minImpressions: v });
              setThresholdsDirty(true);
            }}
            min={1}
            max={10000}
            help="A query must have at least this many impressions in the current window to be flagged as trending."
          />
          <NumberField
            label="Growth ratio (vs prior window)"
            value={thresholds.growthRatio}
            step={0.1}
            onChange={(v) => {
              setThresholds({ ...thresholds, growthRatio: v });
              setThresholdsDirty(true);
            }}
            min={0}
            max={50}
            help="0.5 = +50% more impressions than the prior window of same length."
          />
          <NumberField
            label="Window (days)"
            value={thresholds.windowDays}
            onChange={(v) => {
              setThresholds({ ...thresholds, windowDays: v });
              setThresholdsDirty(true);
            }}
            min={1}
            max={90}
            help="Length of the lookback window for current vs prior comparison."
          />
        </div>
        <div className="mt-3 flex gap-2">
          <button
            onClick={saveThresholds}
            disabled={!thresholdsDirty || savingThresholds}
            className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-semibold"
          >
            {savingThresholds ? '⏳ Saving…' : '💾 Save thresholds'}
          </button>
          <button
            onClick={loadThresholds}
            className="bg-slate-700 hover:bg-slate-600 text-white px-3 py-2 rounded-lg text-xs"
          >
            ↻ Reload from server
          </button>
        </div>
      </details>

      {error && (
        <div className="mb-4 rounded border-2 border-red-700 bg-red-950 p-3 text-sm text-red-200">
          {error}
        </div>
      )}

      {data && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-4 text-sm">
            <Stat label="Queries" value={data.totalRows} />
            <Stat label="Impressions" value={data.totalImpressions} />
            <Stat label="Clicks" value={data.totalClicks} />
            <Stat
              label="High-risk"
              value={data.riskyCount}
              tone={data.riskyCount > 0 ? 'warn' : 'ok'}
            />
            <Stat
              label="Risky & trending"
              value={data.riskyTrendingCount}
              tone={data.riskyTrendingCount > 0 ? 'danger' : 'ok'}
            />
          </div>

          {/* Proposed negatives */}
          <section className="mb-6 rounded-xl border-2 border-amber-700 bg-amber-950/40 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <h3 className="text-white font-semibold">
                🛡 Proposed negative keywords ({proposedNegatives.size})
              </h3>
              <div className="flex gap-2 flex-wrap">
                <button
                  onClick={downloadSampleCsv}
                  className="bg-slate-800 hover:bg-slate-700 text-slate-100 px-3 py-2 rounded-lg text-xs border border-slate-600"
                  title="Download a tiny example CSV matching Google Ads Editor schema"
                >
                  📄 Sample CSV
                </button>
                <button
                  onClick={exportNegativesCsv}
                  className="bg-slate-700 hover:bg-slate-600 text-white px-3 py-2 rounded-lg text-xs"
                >
                  ⬇ Export Google Ads CSV
                </button>
                <button
                  onClick={applyDryRun}
                  disabled={applying || proposedNegatives.size === 0}
                  className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-3 py-2 rounded-lg text-xs font-semibold"
                >
                  {applying ? '⏳' : '🔍'} Dry-run preview
                </button>
                <button
                  onClick={applyLive}
                  disabled={applying || proposedNegatives.size === 0 || !campaignResourceId.trim()}
                  className="bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white px-3 py-2 rounded-lg text-xs font-semibold"
                  title="Live push requires a successful dry-run first"
                >
                  🚀 Apply live
                </button>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
              <label className="text-xs text-amber-100">
                Campaign name (CSV header)
                <input
                  value={campaignName}
                  onChange={(e) => setCampaignName(e.target.value)}
                  className="block mt-1 w-full border-2 border-slate-600 bg-slate-800 text-white rounded px-2 py-1 text-sm"
                />
              </label>
              <label className="text-xs text-amber-100">
                Google Ads campaign ID (numeric) — required for live push
                <input
                  value={campaignResourceId}
                  onChange={(e) => setCampaignResourceId(e.target.value)}
                  placeholder="e.g. 1234567890"
                  className="block mt-1 w-full border-2 border-slate-600 bg-slate-800 text-white rounded px-2 py-1 text-sm font-mono"
                />
              </label>
            </div>
            <div className="max-h-48 overflow-auto rounded border border-amber-800 bg-slate-900 p-2">
              {proposedNegatives.size === 0 ? (
                <p className="text-amber-200 text-xs italic">
                  No proposed negatives. Tick the box on any high-risk row below to add it.
                </p>
              ) : (
                <ul className="flex flex-wrap gap-1.5">
                  {Array.from(proposedNegatives).map((q) => (
                    <li key={q}>
                      <button
                        onClick={() => toggleNegative(q)}
                        className="px-2 py-0.5 rounded bg-red-700 hover:bg-red-600 text-red-50 text-xs font-mono"
                        title="Click to remove"
                      >
                        {q} ✕
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {applyPreview && (
              <div className="mt-3">
                <div className="flex items-center justify-between mb-1">
                  <h4 className="text-xs font-semibold text-slate-200">
                    Server response — verify before pushing live
                  </h4>
                  <div className="flex gap-2">
                    <button
                      onClick={downloadPreviewJson}
                      className="text-xs text-emerald-300 hover:text-emerald-200"
                      title="Download the exact server response (includes correlationId)"
                    >
                      ⬇ Download JSON
                    </button>
                    <button
                      onClick={() => {
                        navigator.clipboard?.writeText(applyPreview);
                        toast.success('Preview copied');
                      }}
                      className="text-xs text-blue-300 hover:text-blue-200"
                    >
                      📋 Copy
                    </button>
                  </div>
                </div>
                <pre className="max-h-64 overflow-auto rounded bg-slate-950 border border-slate-700 text-xs text-emerald-200 p-2 font-mono whitespace-pre-wrap">
                  {applyPreview}
                </pre>
                <p className="text-[11px] text-slate-400 mt-1">
                  Tip: a successful dry-run returns{' '}
                  <code className="text-emerald-300">"mode":"dry-run","ok":true</code> with a{' '}
                  <code className="text-emerald-300">correlationId</code> you can trace in the
                  Compound Negatives Audit tab.
                </p>
              </div>
            )}

          </section>

          {/* Query table */}
          <div className="overflow-auto rounded-xl border-2 border-slate-700 bg-slate-900">
            <table className="w-full text-sm">
              <thead className="bg-slate-800 text-slate-300">
                <tr>
                  <th className="px-3 py-2">+/-</th>
                  <th className="text-left px-3 py-2">Query</th>
                  <th className="text-right px-3 py-2">Impr.</th>
                  <th className="text-right px-3 py-2">Δ Impr.</th>
                  <th className="text-right px-3 py-2">Clicks</th>
                  <th className="text-right px-3 py-2">CTR</th>
                  <th className="text-right px-3 py-2">Pos.</th>
                  <th className="text-left px-3 py-2">Flags</th>
                </tr>
              </thead>
              <tbody>
                {filtered.slice(0, 250).map((r) => {
                  const risky = r.riskTokens.length > 0;
                  const key = r.query.trim().toLowerCase();
                  const checked = proposedNegatives.has(key);
                  return (
                    <tr
                      key={r.query}
                      className={`border-t border-slate-800 ${risky ? 'bg-red-950/40' : ''}`}
                    >
                      <td className="px-3 py-2 text-center">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleNegative(r.query)}
                          aria-label={`Add ${r.query} as negative keyword`}
                        />
                      </td>
                      <td className="px-3 py-2 text-white font-mono text-xs">{r.query}</td>
                      <td className="px-3 py-2 text-right text-slate-200">{r.impressions}</td>
                      <td
                        className={`px-3 py-2 text-right ${
                          r.deltaImpressions > 0
                            ? 'text-emerald-400'
                            : r.deltaImpressions < 0
                            ? 'text-slate-500'
                            : 'text-slate-400'
                        }`}
                      >
                        {r.deltaImpressions > 0 ? '+' : ''}
                        {r.deltaImpressions}
                      </td>
                      <td className="px-3 py-2 text-right text-slate-200">{r.clicks}</td>
                      <td className="px-3 py-2 text-right text-slate-300">
                        {(r.ctr * 100).toFixed(1)}%
                      </td>
                      <td className="px-3 py-2 text-right text-slate-300">
                        {r.position.toFixed(1)}
                      </td>
                      <td className="px-3 py-2 text-xs">
                        <div className="flex flex-wrap gap-1">
                          {r.trending && (
                            <span className="px-1.5 py-0.5 rounded bg-amber-700 text-amber-50">
                              ↑ trending
                            </span>
                          )}
                          {r.riskTokens.map((t) => (
                            <span
                              key={t}
                              className="px-1.5 py-0.5 rounded bg-red-700 text-red-50 font-mono"
                              title="Banned ad token"
                            >
                              {t}
                            </span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-3 py-6 text-center text-slate-400">
                      No queries match this filter.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <p className="text-xs text-slate-500 mt-3">
            Source: Google Search Console · Site: {data.siteUrl} · Window:{' '}
            {data.startDate} → {data.endDate} · Fetched{' '}
            {new Date(data.fetchedAt).toLocaleString('en-GB')}
          </p>
        </>
      )}

      {/* Trend history */}
      <section className="mt-8 rounded-xl border-2 border-slate-700 bg-slate-900 p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-white font-semibold">📈 Weekly trend history</h3>
          <button
            onClick={loadHistory}
            disabled={historyLoading}
            className="bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-white px-3 py-2 rounded-lg text-xs"
          >
            {historyLoading ? '⏳' : '↻'} Load history
          </button>
        </div>
        <p className="text-xs text-slate-400 mb-3">
          Snapshots are written by the weekly cron at{' '}
          <code>/api/public/hooks/compound-query-history</code> (auth via{' '}
          <code>x-cleanup-secret</code>). Schedule it weekly in your cron runner.
        </p>
        {history.length === 0 ? (
          <p className="text-slate-500 text-sm italic">No history loaded yet.</p>
        ) : (
          <div className="overflow-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-800 text-slate-300">
                <tr>
                  <th className="text-left px-3 py-2">Snapshot</th>
                  <th className="text-left px-3 py-2">Page</th>
                  <th className="text-left px-3 py-2">Window</th>
                  <th className="text-right px-3 py-2">Impr.</th>
                  <th className="text-right px-3 py-2">Clicks</th>
                  <th className="text-right px-3 py-2">Risky</th>
                  <th className="text-right px-3 py-2">Risky↑</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h, i) => (
                  <tr key={i} className="border-t border-slate-800">
                    <td className="px-3 py-2 text-slate-300">
                      {h.fetchedAt ? new Date(h.fetchedAt).toLocaleString('en-GB') : '—'}
                    </td>
                    <td className="px-3 py-2 text-emerald-300 font-mono">{h.pagePath}</td>
                    <td className="px-3 py-2 text-slate-400">
                      {h.startDate} → {h.endDate}
                    </td>
                    <td className="px-3 py-2 text-right text-slate-200">
                      {(h.totalImpressions ?? 0).toLocaleString('en-GB')}
                    </td>
                    <td className="px-3 py-2 text-right text-slate-200">
                      {(h.totalClicks ?? 0).toLocaleString('en-GB')}
                    </td>
                    <td className="px-3 py-2 text-right text-amber-300">{h.riskyCount ?? 0}</td>
                    <td className="px-3 py-2 text-right text-red-300">
                      {h.riskyTrendingCount ?? 0}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function Stat({
  label,
  value,
  tone = 'neutral',
}: {
  label: string;
  value: number;
  tone?: 'ok' | 'warn' | 'danger' | 'neutral';
}) {
  const colors =
    tone === 'danger'
      ? 'border-red-700 bg-red-950 text-red-200'
      : tone === 'warn'
      ? 'border-amber-700 bg-amber-950 text-amber-200'
      : tone === 'ok'
      ? 'border-emerald-800 bg-emerald-950 text-emerald-200'
      : 'border-slate-700 bg-slate-800 text-white';
  return (
    <div className={`rounded-lg border-2 p-3 ${colors}`}>
      <div className="text-xs opacity-80">{label}</div>
      <div className="text-lg font-bold">{value.toLocaleString('en-GB')}</div>
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  help,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  help?: string;
}) {
  return (
    <label className="block">
      <span className="text-xs text-slate-300">{label}</span>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1 w-full border-2 border-slate-600 bg-slate-800 text-white rounded px-2 py-1 text-sm"
      />
      {help && <span className="block text-[11px] text-slate-500 mt-1">{help}</span>}
    </label>
  );
}
