import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import {
  Loader2, RefreshCw, TrendingUp, Link2, Search, AlertTriangle,
  ExternalLink, Globe, Download, History, Trash2, BarChart3,
  Timer, Zap, RotateCw, Database as DbIcon,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, CartesianGrid,
} from 'recharts';
import { getAdminIdToken } from '@/lib/auth-ready';
import {
  getSemrushOverview, getSemrushKeywordGeo, getSemrushQuota,
} from '@/lib/semrush.functions';

const REPORT_SCHEMA_VERSION = '1.2.0';
const CACHE_KEY = 'phlabs.admin.semrushGeoCache.v2';
const PENDING_KEY = 'phlabs.admin.semrushGeoPending.v1';
const RUN_HISTORY_KEY = 'phlabs.admin.semrushRunHistory.v1';
const IN_PROGRESS_KEY = 'phlabs.admin.semrushInProgress.v1';
const CONCURRENCY_KEY = 'phlabs.admin.semrushConcurrency.v1';
const CACHE_LIMIT = 20;
const RUN_HISTORY_LIMIT = 100;
const IN_PROGRESS_TTL_MS = 30 * 60 * 1000; // 30 min — stale runs after this
const MAX_RETRIES = 3;
const BACKOFF_BASE_MS = 600;

interface RunHistoryEntry {
  id: string;
  at: string;
  phrase: string;
  term: string;
  mode: 'all' | 'resume' | 'failed';
  requested: number;
  succeeded: number;
  failed: number;
  unitsUsed: number;
  quotaRemaining: number | null;
  coverageAfter: { covered: number; catalog: number; complete: boolean };
  failedDatabases: string[];
  error?: string | null;
}

function loadRunHistory(): RunHistoryEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(RUN_HISTORY_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}
function pushRunHistory(entry: RunHistoryEntry): RunHistoryEntry[] {
  const all = [entry, ...loadRunHistory()].slice(0, RUN_HISTORY_LIMIT);
  try { window.localStorage.setItem(RUN_HISTORY_KEY, JSON.stringify(all)); } catch { /* quota */ }
  return all;
}
function clearRunHistory() {
  try { window.localStorage.removeItem(RUN_HISTORY_KEY); } catch { /* */ }
}

interface OverviewData {
  domain: string;
  database: string;
  fetchedAt: string;
  limits: any;
  ranks: any;
  topKeywords: Array<Record<string, any>>;
  topKeywordsError: string | null;
  backlinks: any;
}

const DATABASES = [
  { id: 'uk', label: 'United Kingdom' },
  { id: 'us', label: 'United States' },
  { id: 'de', label: 'Germany' },
  { id: 'fr', label: 'France' },
  { id: 'es', label: 'Spain' },
  { id: 'it', label: 'Italy' },
];

export default function SemrushTab() {
  const fetchOverview = useServerFn(getSemrushOverview);
  const [data, setData] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [domain, setDomain] = useState('phlabs.co.uk');
  const [database, setDatabase] = useState('uk');

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const idToken = await getAdminIdToken();
      const result = await fetchOverview({ data: { idToken, domain, database } });
      setData(result as OverviewData);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load Semrush data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const ranks = data?.ranks ?? {};
  const bl = data?.backlinks ?? {};

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Search className="w-6 h-6 text-emerald-400" /> Semrush
          </h1>
          <p className="text-sm text-slate-400">
            SEO snapshot from Semrush. Organic data only; reflects Google's index.
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white rounded-lg text-sm font-medium transition-colors"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          Refresh
        </button>
      </div>

      <div className="bg-slate-900 border-2 border-slate-700 rounded-xl p-4 grid grid-cols-1 md:grid-cols-3 gap-3">
        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1">Domain</label>
          <input
            type="text" value={domain}
            onChange={(e) => setDomain(e.target.value.trim())}
            className="w-full min-h-[48px] px-3 bg-slate-800 border-2 border-slate-600 text-white rounded-lg text-sm"
            placeholder="phlabs.co.uk"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1">Database</label>
          <select
            value={database}
            onChange={(e) => setDatabase(e.target.value)}
            className="w-full min-h-[48px] px-3 bg-slate-800 border-2 border-slate-600 text-white rounded-lg text-sm"
          >
            {DATABASES.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
          </select>
        </div>
        <div className="flex items-end">
          <button
            onClick={load}
            disabled={loading}
            className="w-full min-h-[48px] px-4 bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white rounded-lg text-sm font-semibold"
          >
            Run query
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-950/40 border-2 border-red-700/60 rounded-xl p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-red-300 font-semibold text-sm">Semrush request failed</p>
            <p className="text-red-200/80 text-xs font-mono break-all mt-1">{error}</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Organic keywords" value={ranks.Or} icon={<Search className="w-4 h-4" />} />
        <StatCard label="Est. organic traffic" value={ranks.Ot} suffix="/mo" icon={<TrendingUp className="w-4 h-4" />} />
        <StatCard label="Est. traffic cost" value={ranks.Oc} prefix="$" />
        <StatCard label="Global rank" value={ranks.Rk} />
        <StatCard label="Backlinks" value={bl.total} icon={<Link2 className="w-4 h-4" />} />
        <StatCard label="Referring domains" value={bl.domains_num} />
        <StatCard label="Authority score" value={bl.ascore} />
        <StatCard label="Follow / Nofollow" value={bl.follows_num != null ? `${bl.follows_num} / ${bl.nofollows_num ?? 0}` : undefined} />
      </div>

      <div className="bg-slate-900 border-2 border-slate-700 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b-2 border-slate-700 flex items-center justify-between">
          <h2 className="text-white font-semibold text-sm">Top organic keywords</h2>
          {data && (
            <a
              href={`https://www.semrush.com/analytics/overview/?q=${encodeURIComponent(data.domain)}&searchType=domain`}
              target="_blank" rel="noreferrer"
              className="text-xs text-emerald-400 hover:text-emerald-300 inline-flex items-center gap-1"
            >
              Open in Semrush <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>
        {data?.topKeywordsError && (
          <p className="text-red-300 text-xs p-4 font-mono break-all">{data.topKeywordsError}</p>
        )}
        {!data?.topKeywords?.length && !loading && !data?.topKeywordsError && (
          <p className="text-slate-400 text-sm p-4">No keywords returned.</p>
        )}
        {!!data?.topKeywords?.length && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-800/50 text-slate-300 text-xs uppercase tracking-wide">
                <tr>
                  <th className="text-left px-4 py-2">Keyword</th>
                  <th className="text-right px-4 py-2">Pos</th>
                  <th className="text-right px-4 py-2">Volume</th>
                  <th className="text-right px-4 py-2">CPC</th>
                  <th className="text-right px-4 py-2">Traffic %</th>
                  <th className="text-right px-4 py-2">Competition</th>
                </tr>
              </thead>
              <tbody>
                {data.topKeywords.map((r, i) => (
                  <tr key={i} className="border-t border-slate-800 hover:bg-slate-800/40">
                    <td className="px-4 py-2 text-white">{r.Ph}</td>
                    <td className="px-4 py-2 text-right text-slate-200">{r.Po}</td>
                    <td className="px-4 py-2 text-right text-slate-200">{Number(r.Nq).toLocaleString()}</td>
                    <td className="px-4 py-2 text-right text-slate-200">{r.Cp != null ? `$${Number(r.Cp).toFixed(2)}` : '—'}</td>
                    <td className="px-4 py-2 text-right text-slate-200">{r.Tr != null ? `${(Number(r.Tr) * 100).toFixed(2)}%` : '—'}</td>
                    <td className="px-4 py-2 text-right text-slate-200">{r.Co != null ? Number(r.Co).toFixed(2) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <KeywordGeoPanel />

      {data && (
        <p className="text-xs text-slate-500">
          {data.domain} · database: {data.database.toUpperCase()} · fetched {new Date(data.fetchedAt).toLocaleString()}
          {data.limits?.api_units_left != null && <> · units left: {data.limits.api_units_left}</>}
        </p>
      )}
    </div>
  );
}

function StatCard({ label, value, prefix, suffix, icon }: {
  label: string; value: any; prefix?: string; suffix?: string; icon?: React.ReactNode;
}) {
  const display =
    value == null || value === '' ? '—'
      : typeof value === 'number' ? value.toLocaleString()
        : String(value);
  return (
    <div className="bg-slate-900 border-2 border-slate-700 rounded-xl p-3">
      <div className="flex items-center gap-1.5 text-slate-400 text-[11px] uppercase tracking-wide font-semibold">
        {icon}<span>{label}</span>
      </div>
      <p className="text-white text-xl font-bold mt-1">
        {prefix}{display}{suffix && value != null ? <span className="text-xs text-slate-400 font-medium ml-0.5">{suffix}</span> : null}
      </p>
    </div>
  );
}

// =========================================================
// Keyword geo breakdown panel — partial fetch, cache, resume, quota banner
// =========================================================

interface GeoRow {
  database: string;
  country: string;
  volume: number | null;
  cpc: number | null;
  competition: number | null;
  results: number | null;
  error: string | null;
  fetchedAt?: string;
}

interface CatalogEntry { id: string; country: string; }

interface QuotaSnapshot {
  remaining: number | null;
  total: number | null;
  resetAt: string | null;
  isPaid: boolean | null;
}

interface RunRecord {
  at: string;
  fetched: string[];
  trimmed: string[];
  unitsUsed: number;
}

interface CacheEntry {
  phrase: string;
  lastFetchedAt: string;
  rows: GeoRow[]; // merged by database; latest fetch wins
  runs: RunRecord[];
  catalog: CatalogEntry[]; // snapshot of full catalog used
}

interface ServerGeoResponse {
  phrase: string;
  fetchedAt: string;
  requestedDatabases: string[];
  fetchedDatabases: string[];
  trimmedByQuota: string[];
  rows: GeoRow[];
  quota: { before: QuotaSnapshot; after: QuotaSnapshot; unitsUsed: number };
  catalog: CatalogEntry[];
}

interface QuotaResponse extends QuotaSnapshot {
  fetchedAt: string;
  fullRunCost: number;
  databases: CatalogEntry[];
}

function loadCache(): Record<string, CacheEntry> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch { return {}; }
}
function saveCache(cache: Record<string, CacheEntry>) {
  if (typeof window === 'undefined') return;
  // Trim to most-recent CACHE_LIMIT phrases
  const entries = Object.values(cache).sort((a, b) =>
    new Date(b.lastFetchedAt).getTime() - new Date(a.lastFetchedAt).getTime());
  const trimmed: Record<string, CacheEntry> = {};
  for (const e of entries.slice(0, CACHE_LIMIT)) trimmed[e.phrase.toLowerCase()] = e;
  try { window.localStorage.setItem(CACHE_KEY, JSON.stringify(trimmed)); } catch { /* quota */ }
}
function mergeRows(existing: GeoRow[], incoming: GeoRow[]): GeoRow[] {
  const map = new Map<string, GeoRow>();
  for (const r of existing) map.set(r.database, r);
  for (const r of incoming) map.set(r.database, r);
  return Array.from(map.values());
}

function loadPending(): { phrase: string; resetAt: string } | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(PENDING_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
function savePending(p: { phrase: string; resetAt: string } | null) {
  if (typeof window === 'undefined') return;
  try {
    if (p) window.localStorage.setItem(PENDING_KEY, JSON.stringify(p));
    else window.localStorage.removeItem(PENDING_KEY);
  } catch { /* quota */ }
}

function totalsFor(rows: GeoRow[]) {
  const withData = rows.filter((r) => r.volume != null && r.volume > 0).length;
  const totalVolume = rows.reduce((s, r) => s + (r.volume ?? 0), 0);
  const ukVolume = rows.find((r) => r.database === 'uk')?.volume ?? 0;
  const ukSharePct = totalVolume > 0 ? Math.round((ukVolume / totalVolume) * 10000) / 100 : 0;
  return { countries: rows.length, withData, totalVolume, ukVolume, ukSharePct };
}

function buildEnvelope(entry: CacheEntry) {
  const covered = new Set(entry.rows.map((r) => r.database));
  const missing = entry.catalog.filter((c) => !covered.has(c.id));
  const errored = entry.rows.filter((r) => r.error != null).map((r) => ({ database: r.database, country: r.country, error: r.error }));
  const unitsUsedTotal = entry.runs.reduce((s, r) => s + r.unitsUsed, 0);
  const totals = totalsFor(entry.rows);
  return {
    schemaVersion: REPORT_SCHEMA_VERSION,
    reportType: 'semrush.keyword_geo_breakdown',
    generatedAt: new Date().toISOString(),
    source: {
      provider: 'Semrush', endpoint: '/keywords/phrase_this',
      index: 'organic', via: 'Lovable connector gateway',
    },
    parameters: {
      phrase: entry.phrase, selectedTerm: entry.phrase,
      exportColumns: ['Ph', 'Nq', 'Cp', 'Co', 'Nr', 'Td'],
      catalogDatabases: entry.catalog.map((c) => c.id),
    },
    coverage: {
      complete: missing.length === 0,
      catalogSize: entry.catalog.length,
      covered: entry.rows.map((r) => r.database),
      missing: missing.map((m) => ({ database: m.id, country: m.country })),
      errored,
    },
    quota: { unitsUsedTotal, runs: entry.runs },
    fetchedAt: entry.lastFetchedAt,
    totals,
    rows: entry.rows,
  };
}

function KeywordGeoPanel() {
  const fetchGeo = useServerFn(getSemrushKeywordGeo);
  const fetchQuota = useServerFn(getSemrushQuota);

  const [phrase, setPhrase] = useState('research peptides');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cache, setCache] = useState<Record<string, CacheEntry>>({});
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [quota, setQuota] = useState<QuotaResponse | null>(null);
  const [quotaLoading, setQuotaLoading] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [topN, setTopN] = useState<number | 'all'>('all');
  const [progress, setProgress] = useState<{ done: number; total: number; current: string | null } | null>(null);
  const [runHistory, setRunHistory] = useState<RunHistoryEntry[]>([]);
  const resumeTimerRef = useRef<number | null>(null);
  const autoResumeFiredRef = useRef(false);

  // Load cache + pending + initial quota + run history on mount
  useEffect(() => {
    const c = loadCache();
    setCache(c);
    const p = loadPending();
    if (p && c[p.phrase.toLowerCase()]) setActiveKey(p.phrase.toLowerCase());
    setRunHistory(loadRunHistory());
    void refreshQuota();
    // eslint-disable-next-line
  }, []);

  // Live countdown ticker
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);

  // Periodic quota refresh (every 60s) so the banner stays current
  useEffect(() => {
    const t = window.setInterval(() => { void refreshQuota(); }, 60_000);
    return () => window.clearInterval(t);
    // eslint-disable-next-line
  }, []);

  const refreshQuota = useCallback(async () => {
    setQuotaLoading(true);
    try {
      const idToken = await getAdminIdToken();
      const q = (await fetchQuota({ data: { idToken } })) as QuotaResponse;
      setQuota(q);
    } catch { /* silent */ }
    finally { setQuotaLoading(false); }
  }, [fetchQuota]);

  const persistCache = (next: Record<string, CacheEntry>) => {
    setCache(next);
    saveCache(next);
  };

  const activeEntry: CacheEntry | null = activeKey ? cache[activeKey] ?? null : null;

  const sortedRows = useMemo(() => {
    if (!activeEntry) return [];
    return [...activeEntry.rows].sort((a, b) => (b.volume ?? -1) - (a.volume ?? -1));
  }, [activeEntry]);

  const totals = useMemo(() => activeEntry ? totalsFor(activeEntry.rows) : null, [activeEntry]);
  const total = totals?.totalVolume ?? 0;

  const catalog: CatalogEntry[] = quota?.databases ?? activeEntry?.catalog ?? [];
  const coveredSet = useMemo(() => new Set((activeEntry?.rows ?? []).map((r) => r.database)), [activeEntry]);
  const missing = useMemo(
    () => catalog.filter((c) => !coveredSet.has(c.id)),
    [catalog, coveredSet],
  );
  const failedDbs = useMemo(
    () => (activeEntry?.rows ?? []).filter((r) => r.error != null).map((r) => r.database),
    [activeEntry],
  );

  const runLookup = useCallback(async (mode: 'all' | 'resume' | 'failed', overridePhrase?: string) => {
    const term = (overridePhrase ?? phrase).trim();
    if (!term) return;
    const key = term.toLowerCase();
    const prior = cache[key];
    const priorFailed = (prior?.rows ?? []).filter((r) => r.error != null).map((r) => r.database);
    const priorMissing = catalog
      .filter((c) => !(prior?.rows ?? []).some((r) => r.database === c.id))
      .map((c) => c.id);

    const dbList = mode === 'resume'
      ? priorMissing
      : mode === 'failed'
        ? priorFailed
        : (topN === 'all' ? catalog.map((c) => c.id) : catalog.slice(0, topN).map((c) => c.id));

    if (dbList.length === 0) {
      setError(
        mode === 'resume' ? 'All countries already fetched.'
        : mode === 'failed' ? 'No failed countries to retry.'
        : 'No countries to fetch.',
      );
      return;
    }
    if (overridePhrase) setPhrase(overridePhrase);
    setLoading(true);
    setError(null);
    setProgress({ done: 0, total: dbList.length, current: null });

    const startedAt = new Date().toISOString();
    let aggRows: GeoRow[] = [];
    let trimmedAll: string[] = [];
    const quotaRef: { current: QuotaSnapshot | null } = { current: null };
    let unitsUsedTotal = 0;
    let lastCatalog: CatalogEntry[] = catalog;
    let runErr: string | null = null;

    try {
      const idToken = await getAdminIdToken();

      // For mode='failed' we wipe the prior errored rows from cache first so
      // mergeRows replaces them with whatever the retry returns.
      if (mode === 'failed' && prior) {
        const cleaned: CacheEntry = {
          ...prior,
          rows: prior.rows.filter((r) => r.error == null),
        };
        persistCache({ ...cache, [key]: cleaned });
      }

      // Dispatch one call per database in parallel; update progress as each
      // resolves so the UI shows X / N completed live.
      const tasks = dbList.map(async (db) => {
        try {
          const res = (await fetchGeo({ data: {
            idToken, phrase: term, databases: [db], autoLimit: true,
          } })) as ServerGeoResponse;
          aggRows.push(...res.rows.map((r) => ({ ...r, fetchedAt: res.fetchedAt })));
          trimmedAll.push(...res.trimmedByQuota);
          quotaRef.current = res.quota.after;
          unitsUsedTotal += res.quota.unitsUsed;
          if (res.catalog.length) lastCatalog = res.catalog;
        } catch (e: any) {
          // Convert exception into an errored row so it shows up in cache + retry list.
          aggRows.push({
            database: db,
            country: catalog.find((c) => c.id === db)?.country ?? db.toUpperCase(),
            volume: null, cpc: null, competition: null, results: null,
            error: String(e?.message ?? 'request failed').slice(0, 200),
            fetchedAt: new Date().toISOString(),
          });
        } finally {
          setProgress((p) => p ? { done: p.done + 1, total: p.total, current: db } : p);
        }
      });
      await Promise.all(tasks);

      const finishedAt = new Date().toISOString();
      const mergedRows = mergeRows(prior?.rows ?? [], aggRows);
      const entry: CacheEntry = {
        phrase: term,
        lastFetchedAt: finishedAt,
        rows: mergedRows,
        runs: [
          ...(prior?.runs ?? []),
          { at: finishedAt, fetched: dbList, trimmed: trimmedAll, unitsUsed: unitsUsedTotal },
        ].slice(-25),
        catalog: lastCatalog,
      };
      const nextCache = { ...cache, [key]: entry };
      persistCache(nextCache);
      setActiveKey(key);
      const qa: QuotaSnapshot | null = quotaRef.current;
      if (qa) setQuota((q) => q ? { ...q, ...qa } : q);

      // Pending background resume
      const stillMissing = entry.catalog.filter((c) => !entry.rows.some((r) => r.database === c.id));
      if (stillMissing.length > 0 && qa?.resetAt && (qa.remaining ?? 0) < stillMissing.length) {
        savePending({ phrase: term, resetAt: qa.resetAt });
        autoResumeFiredRef.current = false;
      } else {
        savePending(null);
      }

      // Append cross-phrase audit log
      const succeeded = aggRows.filter((r) => r.error == null).length;
      const failedCount = aggRows.length - succeeded;
      const failedList = aggRows.filter((r) => r.error != null).map((r) => r.database);
      const history = pushRunHistory({
        id: `${startedAt}-${key}-${mode}`,
        at: startedAt,
        phrase: term, term, mode,
        requested: dbList.length,
        succeeded, failed: failedCount,
        unitsUsed: unitsUsedTotal,
        quotaRemaining: quotaRef.current?.remaining ?? null,
        coverageAfter: {
          covered: entry.rows.length,
          catalog: entry.catalog.length,
          complete: stillMissing.length === 0,
        },
        failedDatabases: failedList,
      });
      setRunHistory(history);
    } catch (e: any) {
      runErr = e?.message ?? 'Lookup failed';
      setError(runErr);
      const history = pushRunHistory({
        id: `${startedAt}-${key}-${mode}-err`,
        at: startedAt, phrase: term, term, mode,
        requested: dbList.length, succeeded: 0, failed: dbList.length,
        unitsUsed: unitsUsedTotal, quotaRemaining: quotaRef.current?.remaining ?? null,
        coverageAfter: {
          covered: prior?.rows?.length ?? 0,
          catalog: prior?.catalog?.length ?? catalog.length,
          complete: false,
        },
        failedDatabases: dbList, error: runErr,
      });
      setRunHistory(history);
    } finally {
      setLoading(false);
      setProgress(null);
    }
  }, [phrase, topN, catalog, cache, fetchGeo]);

  // Auto-resume when the quota window resets
  useEffect(() => {
    if (resumeTimerRef.current) {
      window.clearTimeout(resumeTimerRef.current);
      resumeTimerRef.current = null;
    }
    const pending = loadPending();
    if (!pending || !quota?.resetAt) return;
    const resetMs = new Date(pending.resetAt).getTime();
    const delay = resetMs - Date.now() + 5_000; // 5s buffer
    if (delay <= 0) {
      // Already past reset; check quota and resume immediately
      void (async () => {
        await refreshQuota();
        if (!autoResumeFiredRef.current && pending) {
          autoResumeFiredRef.current = true;
          await runLookup('resume', pending.phrase);
        }
      })();
      return;
    }
    resumeTimerRef.current = window.setTimeout(async () => {
      await refreshQuota();
      if (!autoResumeFiredRef.current) {
        autoResumeFiredRef.current = true;
        await runLookup('resume', pending.phrase);
      }
    }, Math.min(delay, 2_147_483_000));
    return () => {
      if (resumeTimerRef.current) {
        window.clearTimeout(resumeTimerRef.current);
        resumeTimerRef.current = null;
      }
    };
  }, [quota?.resetAt, runLookup, refreshQuota]);

  const triggerDownload = (filename: string, mime: string, content: string) => {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  };

  const downloadJsonFor = (entry: CacheEntry) => {
    const env = buildEnvelope(entry);
    triggerDownload(
      `seo-geo-${slugify(entry.phrase)}-${dateStamp()}${env.coverage.complete ? '' : '-partial'}.json`,
      'application/json',
      JSON.stringify(env, null, 2),
    );
  };

  const downloadCsvFor = (entry: CacheEntry) => {
    const env = buildEnvelope(entry);
    const header = ['country', 'database', 'volume', 'cpc', 'competition', 'results', 'share_pct', 'fetched_at', 'error'];
    const totalVol = env.totals.totalVolume || 0;
    const sorted = [...entry.rows].sort((a, b) => (b.volume ?? -1) - (a.volume ?? -1));
    const lines: string[] = [];
    lines.push(`# schema_version,${env.schemaVersion}`);
    lines.push(`# report_type,${env.reportType}`);
    lines.push(`# generated_at,${env.generatedAt}`);
    lines.push(`# fetched_at,${env.fetchedAt}`);
    lines.push(`# source_provider,${env.source.provider}`);
    lines.push(`# source_endpoint,${env.source.endpoint}`);
    lines.push(`# param_phrase,${csvCell(env.parameters.phrase)}`);
    lines.push(`# param_selected_term,${csvCell(env.parameters.selectedTerm)}`);
    lines.push(`# param_export_columns,${env.parameters.exportColumns.join('|')}`);
    lines.push(`# param_catalog,${env.parameters.catalogDatabases.join('|')}`);
    lines.push(`# coverage_complete,${env.coverage.complete}`);
    lines.push(`# coverage_catalog_size,${env.coverage.catalogSize}`);
    lines.push(`# coverage_covered,${env.coverage.covered.join('|')}`);
    lines.push(`# coverage_missing,${env.coverage.missing.map((m) => m.database).join('|')}`);
    lines.push(`# coverage_errored,${env.coverage.errored.map((e) => e.database).join('|')}`);
    lines.push(`# quota_units_used_total,${env.quota.unitsUsedTotal}`);
    lines.push(`# quota_runs,${env.quota.runs.length}`);
    lines.push(`# totals_countries,${env.totals.countries}`);
    lines.push(`# totals_with_data,${env.totals.withData}`);
    lines.push(`# totals_total_volume,${env.totals.totalVolume}`);
    lines.push(`# totals_uk_volume,${env.totals.ukVolume}`);
    lines.push(`# totals_uk_share_pct,${env.totals.ukSharePct}`);
    lines.push('');
    lines.push(header.join(','));
    for (const r of sorted) {
      const share = totalVol > 0 && r.volume != null ? ((r.volume / totalVol) * 100).toFixed(2) : '';
      lines.push([
        csvCell(r.country), csvCell(r.database),
        r.volume ?? '', r.cpc ?? '', r.competition ?? '', r.results ?? '',
        share, csvCell(r.fetchedAt ?? ''), csvCell(r.error ?? ''),
      ].join(','));
    }
    triggerDownload(
      `seo-geo-${slugify(entry.phrase)}-${dateStamp()}${env.coverage.complete ? '' : '-partial'}.csv`,
      'text/csv',
      lines.join('\n'),
    );
  };

  const chartData = useMemo(() => {
    return sortedRows
      .filter((r) => r.volume != null && r.volume > 0)
      .map((r) => ({
        country: r.country, database: r.database,
        volume: r.volume ?? 0, isUk: r.database === 'uk',
      }));
  }, [sortedRows]);

  const cacheList = useMemo(
    () => Object.values(cache).sort((a, b) =>
      new Date(b.lastFetchedAt).getTime() - new Date(a.lastFetchedAt).getTime()),
    [cache],
  );

  // Quota banner derived values
  const quotaRemaining = quota?.remaining ?? null;
  const fullRunCost = quota?.fullRunCost ?? catalog.length;
  const resetMs = quota?.resetAt ? new Date(quota.resetAt).getTime() : null;
  const msUntilReset = resetMs != null ? resetMs - now : null;
  const isReset = msUntilReset != null && msUntilReset <= 0;
  const lowQuota = quotaRemaining != null && quotaRemaining < fullRunCost;
  const exhausted = quotaRemaining === 0;

  return (
    <div className="bg-slate-900 border-2 border-slate-700 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b-2 border-slate-700 flex items-center gap-2">
        <Globe className="w-4 h-4 text-emerald-400" />
        <h2 className="text-white font-semibold text-sm">Keyword geo breakdown</h2>
        <span className="text-xs text-slate-400 ml-auto">Per-country monthly volume · UK share of search</span>
      </div>

      {/* Quota banner */}
      <QuotaBanner
        quota={quota} quotaLoading={quotaLoading} msUntilReset={msUntilReset}
        isReset={isReset} lowQuota={lowQuota} exhausted={exhausted}
        fullRunCost={fullRunCost} missingCount={missing.length}
        onRetry={async () => {
          await refreshQuota();
          const pending = loadPending();
          if (pending) {
            autoResumeFiredRef.current = true;
            await runLookup('resume', pending.phrase);
          } else if (activeEntry && missing.length > 0) {
            await runLookup('resume', activeEntry.phrase);
          }
        }}
      />

      <div className="p-4 grid grid-cols-1 md:grid-cols-[1fr_auto_auto_auto_auto_auto] gap-3 items-end">
        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1">Keyword / phrase</label>
          <input
            type="text" value={phrase}
            onChange={(e) => setPhrase(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !loading) runLookup('all'); }}
            maxLength={80}
            className="w-full min-h-[48px] px-3 bg-slate-800 border-2 border-slate-600 text-white rounded-lg text-sm"
            placeholder="e.g. research peptides"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1">Top N</label>
          <select
            value={String(topN)}
            onChange={(e) => setTopN(e.target.value === 'all' ? 'all' : Number(e.target.value))}
            className="min-h-[48px] px-3 bg-slate-800 border-2 border-slate-600 text-white rounded-lg text-sm"
            title="Limit run to top N priority countries (auto-trimmed further if quota is low)"
          >
            <option value="all">All ({fullRunCost})</option>
            <option value="5">Top 5</option>
            <option value="10">Top 10</option>
            <option value="15">Top 15</option>
            <option value="20">Top 20</option>
          </select>
        </div>
        <button
          onClick={() => runLookup('all')}
          disabled={loading || !phrase.trim()}
          className="min-h-[48px] px-4 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white rounded-lg text-sm font-semibold inline-flex items-center gap-2"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
          Lookup
        </button>
        <button
          onClick={() => runLookup('resume')}
          disabled={loading || !activeEntry || missing.length === 0}
          className="min-h-[48px] px-3 bg-blue-700 hover:bg-blue-600 disabled:opacity-40 text-white rounded-lg text-sm font-semibold inline-flex items-center gap-2"
          title={missing.length > 0 ? `Fetch ${missing.length} missing countries` : 'All countries already fetched'}
        >
          <RotateCw className="w-4 h-4" /> Resume {missing.length > 0 ? `(${missing.length})` : ''}
        </button>
        <button
          onClick={() => runLookup('failed')}
          disabled={loading || !activeEntry || failedDbs.length === 0}
          className="min-h-[48px] px-3 bg-amber-700 hover:bg-amber-600 disabled:opacity-40 text-white rounded-lg text-sm font-semibold inline-flex items-center gap-2"
          title={failedDbs.length > 0 ? `Retry ${failedDbs.length} failed countries` : 'No failed countries to retry'}
        >
          <RotateCw className="w-4 h-4" /> Retry failed {failedDbs.length > 0 ? `(${failedDbs.length})` : ''}
        </button>
        <div className="flex gap-2">
          <button
            onClick={() => activeEntry && downloadCsvFor(activeEntry)}
            disabled={!activeEntry}
            className="min-h-[48px] px-3 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-white rounded-lg text-sm font-medium border-2 border-slate-600 inline-flex items-center gap-2"
            title="Download CSV (includes partial-coverage metadata)"
          >
            <Download className="w-4 h-4" /> CSV
          </button>
          <button
            onClick={() => activeEntry && downloadJsonFor(activeEntry)}
            disabled={!activeEntry}
            className="min-h-[48px] px-3 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-white rounded-lg text-sm font-medium border-2 border-slate-600 inline-flex items-center gap-2"
            title="Download JSON (includes partial-coverage metadata)"
          >
            <Download className="w-4 h-4" /> JSON
          </button>
        </div>
      </div>

      {progress && (
        <div className="mx-4 mb-2 bg-slate-950/60 border-2 border-emerald-700/40 rounded-lg p-3">
          <div className="flex items-center justify-between text-xs mb-1.5">
            <span className="text-emerald-200 font-semibold inline-flex items-center gap-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Fetching {progress.done} / {progress.total} countries
              {progress.current && <span className="text-slate-400 font-mono">· {progress.current.toUpperCase()}</span>}
            </span>
            <span className="text-slate-400">{Math.round((progress.done / Math.max(1, progress.total)) * 100)}%</span>
          </div>
          <div className="h-2 w-full rounded bg-slate-800 overflow-hidden">
            <div
              className="h-full bg-emerald-500 transition-all duration-200"
              style={{ width: `${Math.min(100, (progress.done / Math.max(1, progress.total)) * 100)}%` }}
            />
          </div>
        </div>
      )}


      {topN !== 'all' && quotaRemaining != null && quotaRemaining < (Number(topN) || 0) && (
        <div className="mx-4 mb-2 bg-amber-950/30 border border-amber-700/40 rounded-lg p-2 text-xs text-amber-200 flex items-center gap-2">
          <Zap className="w-3.5 h-3.5" />
          Quota only allows {quotaRemaining} calls — top {quotaRemaining} of {topN} will be fetched. Use Resume after reset to fill the rest.
        </div>
      )}

      {error && (
        <div className="mx-4 mb-4 bg-red-950/40 border-2 border-red-700/60 rounded-lg p-3 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
          <div className="text-xs">
            <p className="text-red-200 font-mono break-all">{error}</p>
            {(error.includes('134') || /quota/i.test(error)) && (
              <p className="text-red-200/80 mt-2 font-sans">
                Out of Semrush API units. Free plan = 10 calls/day. Partial results below remain cached — use Resume after reset.
              </p>
            )}
          </div>
        </div>
      )}

      {activeEntry && totals && (
        <>
          <div className="px-4 pb-4 grid grid-cols-2 md:grid-cols-5 gap-3">
            <StatCard label="Total monthly volume" value={totals.totalVolume} suffix={`/${totals.countries} countries`} />
            <StatCard label="Countries with data" value={totals.withData} />
            <StatCard label="UK monthly volume" value={totals.ukVolume} />
            <StatCard label="UK share of search" value={totals.ukSharePct} suffix="%" />
            <StatCard
              label="Coverage"
              value={`${activeEntry.rows.length}/${activeEntry.catalog.length}`}
              suffix={missing.length === 0 ? ' complete' : ` · ${missing.length} missing`}
            />
          </div>

          {/* Chart */}
          <div className="px-4 pb-4">
            <div className="bg-slate-950/60 border-2 border-slate-700 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-2">
                <BarChart3 className="w-4 h-4 text-emerald-400" />
                <h3 className="text-white text-xs font-semibold uppercase tracking-wide">
                  Per-country search volume
                </h3>
                <span className="ml-auto text-[11px] text-emerald-400 font-semibold">
                  UK highlighted · {totals.ukSharePct}% share
                </span>
              </div>
              {chartData.length === 0 ? (
                <p className="text-slate-400 text-xs py-8 text-center">No countries returned volume data for this phrase.</p>
              ) : (
                <div style={{ width: '100%', height: Math.max(220, chartData.length * 22 + 40) }}>
                  <ResponsiveContainer>
                    <BarChart data={chartData} layout="vertical" margin={{ top: 8, right: 24, left: 8, bottom: 8 }}>
                      <CartesianGrid stroke="#1e293b" horizontal={false} />
                      <XAxis type="number" stroke="#94a3b8" tick={{ fontSize: 11 }} />
                      <YAxis dataKey="country" type="category" stroke="#94a3b8" tick={{ fontSize: 11 }} width={120} />
                      <Tooltip
                        cursor={{ fill: '#1e293b' }}
                        contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 8, fontSize: 12 }}
                        labelStyle={{ color: '#e2e8f0' }}
                        formatter={(value: any, _name: any, ctx: any) => {
                          const v = Number(value) || 0;
                          const share = total > 0 ? ((v / total) * 100).toFixed(2) : '0';
                          return [`${v.toLocaleString()} /mo (${share}%)`, ctx?.payload?.isUk ? 'UK volume' : 'Volume'];
                        }}
                      />
                      <Bar dataKey="volume" radius={[0, 4, 4, 0]}>
                        {chartData.map((d, i) => (
                          <Cell key={i} fill={d.isUk ? '#10b981' : '#3b82f6'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </div>

          {/* Missing-countries chip strip */}
          {missing.length > 0 && (
            <div className="px-4 pb-3">
              <div className="bg-slate-950/60 border border-slate-700 rounded-lg p-3">
                <div className="flex items-center gap-2 mb-2">
                  <DbIcon className="w-3.5 h-3.5 text-amber-400" />
                  <span className="text-xs font-semibold text-amber-200 uppercase tracking-wide">
                    Missing — not yet fetched
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {missing.map((m) => (
                    <span key={m.id} className="text-[11px] bg-slate-800 border border-slate-600 text-slate-300 px-2 py-0.5 rounded">
                      {m.country} <span className="text-slate-500">·</span> {m.id.toUpperCase()}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-800/50 text-slate-300 text-xs uppercase tracking-wide">
                <tr>
                  <th className="text-left px-4 py-2">Country</th>
                  <th className="text-left px-4 py-2">DB</th>
                  <th className="text-right px-4 py-2">Volume / mo</th>
                  <th className="text-right px-4 py-2">Share</th>
                  <th className="text-right px-4 py-2">CPC ($)</th>
                  <th className="text-right px-4 py-2">Competition</th>
                </tr>
              </thead>
              <tbody>
                {sortedRows.map((r) => {
                  const share = total > 0 && r.volume != null ? (r.volume / total) * 100 : 0;
                  return (
                    <tr key={r.database} className={`border-t border-slate-800 ${r.database === 'uk' ? 'bg-emerald-950/30' : 'hover:bg-slate-800/40'}`}>
                      <td className="px-4 py-2 text-white">
                        {r.country}
                        {r.database === 'uk' && <span className="ml-2 text-[10px] uppercase font-semibold text-emerald-400">UK</span>}
                      </td>
                      <td className="px-4 py-2 text-slate-400 uppercase">{r.database}</td>
                      <td className="px-4 py-2 text-right text-slate-200">{r.error ? <span className="text-red-400 text-xs" title={r.error}>err</span> : r.volume != null ? r.volume.toLocaleString() : '—'}</td>
                      <td className="px-4 py-2 text-right text-slate-200">{r.volume != null && total > 0 ? `${share.toFixed(2)}%` : '—'}</td>
                      <td className="px-4 py-2 text-right text-slate-200">{r.cpc != null ? r.cpc.toFixed(2) : '—'}</td>
                      <td className="px-4 py-2 text-right text-slate-200">{r.competition != null ? r.competition.toFixed(2) : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="px-4 py-3 text-xs text-slate-500">
            phrase: <span className="text-slate-300">{activeEntry.phrase}</span> ·
            last fetched {new Date(activeEntry.lastFetchedAt).toLocaleString()} ·
            runs: {activeEntry.runs.length} ·
            units used: {activeEntry.runs.reduce((s, r) => s + r.unitsUsed, 0)} ·
            schema v{REPORT_SCHEMA_VERSION}
          </p>
        </>
      )}

      {/* Saved searches / cache */}
      <div className="border-t-2 border-slate-700">
        <div className="px-4 py-3 flex items-center gap-2">
          <History className="w-4 h-4 text-emerald-400" />
          <h3 className="text-white text-sm font-semibold">Cached searches</h3>
          <span className="text-xs text-slate-500 ml-2">Stored locally · last {CACHE_LIMIT} · per-country cache reused on re-render & download</span>
          {cacheList.length > 0 && (
            <button
              onClick={() => { persistCache({}); setActiveKey(null); savePending(null); }}
              className="ml-auto text-xs text-slate-400 hover:text-red-300 inline-flex items-center gap-1"
              title="Clear cache"
            >
              <Trash2 className="w-3.5 h-3.5" /> Clear
            </button>
          )}
        </div>
        {cacheList.length === 0 ? (
          <p className="px-4 pb-4 text-xs text-slate-500">No cached searches yet — run a lookup above to start.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-800/40 text-slate-300 text-xs uppercase tracking-wide">
                <tr>
                  <th className="text-left px-4 py-2">Phrase</th>
                  <th className="text-right px-4 py-2">Coverage</th>
                  <th className="text-right px-4 py-2">Total vol</th>
                  <th className="text-right px-4 py-2">UK share</th>
                  <th className="text-right px-4 py-2">Units used</th>
                  <th className="text-left px-4 py-2">Last fetched</th>
                  <th className="text-right px-4 py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {cacheList.map((e) => {
                  const t = totalsFor(e.rows);
                  const used = e.runs.reduce((s, r) => s + r.unitsUsed, 0);
                  const complete = e.rows.length >= e.catalog.length;
                  const key = e.phrase.toLowerCase();
                  return (
                    <tr key={key} className={`border-t border-slate-800 hover:bg-slate-800/40 ${activeKey === key ? 'bg-emerald-950/20' : ''}`}>
                      <td className="px-4 py-2 text-white">{e.phrase}</td>
                      <td className="px-4 py-2 text-right">
                        <span className={complete ? 'text-emerald-300' : 'text-amber-300'}>
                          {e.rows.length}/{e.catalog.length}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-right text-slate-200">{t.totalVolume.toLocaleString()}</td>
                      <td className="px-4 py-2 text-right text-emerald-300 font-semibold">{t.ukSharePct}%</td>
                      <td className="px-4 py-2 text-right text-slate-300">{used}</td>
                      <td className="px-4 py-2 text-slate-400 text-xs">{new Date(e.lastFetchedAt).toLocaleString()}</td>
                      <td className="px-4 py-2 text-right">
                        <div className="inline-flex items-center gap-1">
                          <button
                            onClick={() => { setActiveKey(key); setPhrase(e.phrase); }}
                            className="px-2 py-1 text-xs bg-slate-800 hover:bg-slate-700 text-white rounded border border-slate-600"
                            title="Show cached result (no API call)"
                          >
                            View
                          </button>
                          <button
                            onClick={() => runLookup('all', e.phrase)}
                            disabled={loading}
                            className="px-2 py-1 text-xs bg-blue-700 hover:bg-blue-600 disabled:opacity-50 text-white rounded"
                            title="Re-run all countries (uses API quota)"
                          >
                            Re-run
                          </button>
                          {!complete && (
                            <button
                              onClick={() => runLookup('resume', e.phrase)}
                              disabled={loading}
                              className="px-2 py-1 text-xs bg-amber-700 hover:bg-amber-600 disabled:opacity-50 text-white rounded inline-flex items-center gap-1"
                              title="Fetch only missing countries"
                            >
                              <RotateCw className="w-3 h-3" /> Resume
                            </button>
                          )}
                          <button
                            onClick={() => downloadCsvFor(e)}
                            className="px-2 py-1 text-xs bg-slate-800 hover:bg-slate-700 text-white rounded border border-slate-600 inline-flex items-center gap-1"
                            title="Download cached CSV (no API call)"
                          >
                            <Download className="w-3 h-3" /> CSV
                          </button>
                          <button
                            onClick={() => downloadJsonFor(e)}
                            className="px-2 py-1 text-xs bg-slate-800 hover:bg-slate-700 text-white rounded border border-slate-600 inline-flex items-center gap-1"
                            title="Download cached JSON (no API call)"
                          >
                            <Download className="w-3 h-3" /> JSON
                          </button>
                          <button
                            onClick={() => {
                              const next = { ...cache }; delete next[key];
                              persistCache(next);
                              if (activeKey === key) setActiveKey(null);
                            }}
                            className="px-2 py-1 text-xs text-slate-400 hover:text-red-300"
                            title="Remove from cache"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Run history audit log (cross-phrase) */}
      <div className="border-t-2 border-slate-700">
        <div className="px-4 py-3 flex items-center gap-2">
          <Timer className="w-4 h-4 text-blue-400" />
          <h3 className="text-white text-sm font-semibold">Run history</h3>
          <span className="text-xs text-slate-500 ml-2">
            Audit log of every Semrush run · last {RUN_HISTORY_LIMIT} stored locally
          </span>
          {runHistory.length > 0 && (
            <button
              onClick={() => { clearRunHistory(); setRunHistory([]); }}
              className="ml-auto text-xs text-slate-400 hover:text-red-300 inline-flex items-center gap-1"
              title="Clear run history"
            >
              <Trash2 className="w-3.5 h-3.5" /> Clear history
            </button>
          )}
        </div>
        {runHistory.length === 0 ? (
          <p className="px-4 pb-4 text-xs text-slate-500">No runs logged yet.</p>
        ) : (
          <div className="overflow-x-auto max-h-72">
            <table className="w-full text-xs">
              <thead className="bg-slate-800/40 text-slate-300 uppercase tracking-wide sticky top-0">
                <tr>
                  <th className="text-left px-4 py-2">When</th>
                  <th className="text-left px-4 py-2">Phrase</th>
                  <th className="text-left px-4 py-2">Mode</th>
                  <th className="text-right px-4 py-2">Req</th>
                  <th className="text-right px-4 py-2">OK</th>
                  <th className="text-right px-4 py-2">Fail</th>
                  <th className="text-right px-4 py-2">Units</th>
                  <th className="text-right px-4 py-2">Quota left</th>
                  <th className="text-left px-4 py-2">Coverage</th>
                  <th className="text-left px-4 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {runHistory.map((h) => (
                  <tr key={h.id} className="border-t border-slate-800 hover:bg-slate-800/40">
                    <td className="px-4 py-1.5 text-slate-400">{new Date(h.at).toLocaleString()}</td>
                    <td className="px-4 py-1.5 text-white">{h.phrase}</td>
                    <td className="px-4 py-1.5">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] uppercase font-semibold ${
                        h.mode === 'all' ? 'bg-emerald-900/50 text-emerald-200'
                        : h.mode === 'resume' ? 'bg-blue-900/50 text-blue-200'
                        : 'bg-amber-900/50 text-amber-200'
                      }`}>{h.mode}</span>
                    </td>
                    <td className="px-4 py-1.5 text-right text-slate-300">{h.requested}</td>
                    <td className="px-4 py-1.5 text-right text-emerald-300">{h.succeeded}</td>
                    <td className={`px-4 py-1.5 text-right ${h.failed > 0 ? 'text-red-300' : 'text-slate-500'}`}>{h.failed}</td>
                    <td className="px-4 py-1.5 text-right text-slate-200">{h.unitsUsed}</td>
                    <td className="px-4 py-1.5 text-right text-slate-400">{h.quotaRemaining ?? '—'}</td>
                    <td className="px-4 py-1.5">
                      <span className={h.coverageAfter.complete ? 'text-emerald-300' : 'text-amber-300'}>
                        {h.coverageAfter.covered}/{h.coverageAfter.catalog}
                        {h.coverageAfter.complete ? ' ✓' : ''}
                      </span>
                    </td>
                    <td className="px-4 py-1.5">
                      {h.error
                        ? <span className="text-red-300" title={h.error}>error</span>
                        : h.failed > 0
                          ? <span className="text-amber-300" title={h.failedDatabases.join(', ')}>
                              partial · {h.failedDatabases.length} failed
                            </span>
                          : <span className="text-emerald-300">ok</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>

  );
}

function QuotaBanner({
  quota, quotaLoading, msUntilReset, isReset, lowQuota, exhausted,
  fullRunCost, missingCount, onRetry,
}: {
  quota: QuotaResponse | null;
  quotaLoading: boolean;
  msUntilReset: number | null;
  isReset: boolean;
  lowQuota: boolean;
  exhausted: boolean;
  fullRunCost: number;
  missingCount: number;
  onRetry: () => void;
}) {
  if (!quota) {
    return (
      <div className="mx-4 mt-4 mb-2 bg-slate-950/60 border border-slate-700 rounded-lg p-3 text-xs text-slate-400 flex items-center gap-2">
        <Loader2 className={`w-3.5 h-3.5 ${quotaLoading ? 'animate-spin' : ''}`} />
        Checking Semrush quota…
      </div>
    );
  }
  const tone = exhausted ? 'red' : lowQuota ? 'amber' : 'emerald';
  const palette = {
    red: { bg: 'bg-red-950/40', border: 'border-red-700/60', icon: 'text-red-300', text: 'text-red-100' },
    amber: { bg: 'bg-amber-950/40', border: 'border-amber-700/60', icon: 'text-amber-300', text: 'text-amber-100' },
    emerald: { bg: 'bg-emerald-950/30', border: 'border-emerald-700/50', icon: 'text-emerald-300', text: 'text-emerald-100' },
  }[tone];

  const resetLabel = quota.resetAt
    ? `${new Date(quota.resetAt).toLocaleString()}`
    : 'unknown';
  const countdown = msUntilReset != null && msUntilReset > 0
    ? formatDuration(msUntilReset)
    : isReset ? 'reset available' : null;

  return (
    <div className={`mx-4 mt-4 mb-2 ${palette.bg} border-2 ${palette.border} rounded-lg p-3 flex items-start gap-3`}>
      <Timer className={`w-5 h-5 shrink-0 mt-0.5 ${palette.icon}`} />
      <div className="flex-1 text-xs">
        <p className={`${palette.text} font-semibold flex items-center gap-2 flex-wrap`}>
          <span>Semrush quota: {quota.remaining ?? '?'} / {quota.total ?? '?'} units remaining</span>
          {(() => {
            // Plan badge — Trial / Paid / Free. Trial inferred from is_paid=true + small total.
            if (quota.isPaid === true) {
              const isTrial = (quota.total ?? 0) > 0 && (quota.total ?? 0) <= 3000;
              return (
                <span className={`text-[10px] uppercase tracking-wide font-bold px-1.5 py-0.5 rounded
                  ${isTrial ? 'bg-blue-700 text-white' : 'bg-emerald-700 text-white'}`}>
                  {isTrial ? '7-day Trial' : 'Paid'}
                </span>
              );
            }
            if (quota.isPaid === false) {
              return <span className="text-[10px] uppercase tracking-wide font-bold px-1.5 py-0.5 rounded bg-slate-700 text-slate-200">Free plan</span>;
            }
            return null;
          })()}
        </p>
        <p className={`${palette.text} opacity-80 mt-0.5`}>
          A full {fullRunCost}-country geo run costs {fullRunCost} units.
          {' '}Resets at <span className="font-mono">{resetLabel}</span>
          {countdown && <> · <span className="font-mono">{countdown}</span></>}
          {missingCount > 0 && <> · {missingCount} country/ies pending for current phrase.</>}
        </p>
      </div>
      <button
        onClick={onRetry}
        disabled={quotaLoading}
        className={`shrink-0 px-3 py-1.5 rounded text-xs font-semibold border-2 inline-flex items-center gap-1
          ${isReset || !exhausted
            ? 'bg-emerald-700 hover:bg-emerald-600 border-emerald-600 text-white'
            : 'bg-slate-800 hover:bg-slate-700 border-slate-600 text-slate-200'}`}
        title="Re-check quota and resume any pending fetch"
      >
        {quotaLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCw className="w-3.5 h-3.5" />}
        Retry now
      </button>
    </div>
  );
}

function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m ${sec}s`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

function csvCell(v: string): string {
  if (v == null) return '';
  const needs = /[",\n]/.test(v);
  const s = String(v).replace(/"/g, '""');
  return needs ? `"${s}"` : s;
}
function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'keyword';
}
function dateStamp(): string {
  return new Date().toISOString().slice(0, 10);
}
