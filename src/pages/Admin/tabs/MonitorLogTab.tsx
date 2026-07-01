import { useEffect, useMemo, useState } from 'react';
import { auth } from '@/lib/firebase';
import {
  RefreshCw,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  CheckCircle2,
  Filter,
} from 'lucide-react';

interface Row {
  id: string;
  host: string;
  head_status: string | null;
  get_status: string | null;
  head_attempts: number | null;
  get_attempts: number | null;
  head_duration_ms: number | null;
  get_duration_ms: number | null;
  html_bytes: number | null;
  assets_total: number | null;
  assets_ok: number | null;
  has_module_entry: boolean | null;
  alerts: unknown;
  info: unknown;
  missing_bundles: unknown;
  asset_samples: unknown;
  head_headers: unknown;
  get_headers: unknown;
  html_snippet: string | null;
  had_alert: boolean;
  source: string | null;
  run_url: string | null;
  created_at: string;
}

const PAGE_SIZE = 50;

function toArr(v: unknown): unknown[] {
  if (!v) return [];
  if (Array.isArray(v)) return v;
  try { const p = typeof v === 'string' ? JSON.parse(v) : v; return Array.isArray(p) ? p : [p]; }
  catch { return [String(v)]; }
}

function fmt(dt: string): string {
  try { return new Date(dt).toISOString().replace('T', ' ').slice(0, 19) + ' UTC'; }
  catch { return dt; }
}

export default function MonitorLogTab() {
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [hosts, setHosts] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // filters
  const [host, setHost] = useState('');
  const [hadAlert, setHadAlert] = useState<'all' | 'true' | 'false'>('all');
  const [since, setSince] = useState('');
  const [until, setUntil] = useState('');
  const [offset, setOffset] = useState(0);

  const alertCount = useMemo(() => rows.filter((r) => r.had_alert).length, [rows]);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const u = auth.currentUser;
      if (!u) throw new Error('Not signed in');
      const idToken = await u.getIdToken();
      const body: Record<string, unknown> = { idToken, hadAlert, limit: PAGE_SIZE, offset };
      if (host) body.host = host;
      if (since) body.since = new Date(since).toISOString();
      if (until) body.until = new Date(until).toISOString();
      const res = await fetch('/api/public/monitor-log', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.detail || json?.error || `HTTP ${res.status}`);
      setRows(json.rows || []);
      setTotal(json.total || 0);
      setHosts(json.hosts || []);
    } catch (e) {
      setErr((e as Error).message);
      setRows([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [offset]);

  function toggle(id: string) {
    setExpanded((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }

  function applyFilters() { setOffset(0); void load(); }
  function reset() {
    setHost(''); setHadAlert('all'); setSince(''); setUntil(''); setOffset(0);
    setTimeout(() => void load(), 0);
  }

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-2xl font-semibold text-white">Monitor Log (HEAD vs GET)</h2>
          <p className="text-sm text-slate-400">
            Persisted results from <code className="text-emerald-400">monitor_head_get_log</code>.
            Showing {rows.length} of {total.toLocaleString()} rows ({alertCount} with alerts on this page).
          </p>
        </div>
        <button
          onClick={() => { setOffset(0); void load(); }}
          disabled={loading}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="rounded-xl border-2 border-slate-700 bg-slate-900 p-4">
        <div className="flex items-center gap-2 text-slate-300 text-sm mb-3">
          <Filter className="w-4 h-4" /> Filters
        </div>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          <div>
            <label className="block text-xs text-slate-400 mb-1">Host</label>
            <select
              value={host}
              onChange={(e) => setHost(e.target.value)}
              className="w-full min-h-[44px] rounded-lg border-2 border-slate-600 bg-slate-800 text-white px-3"
            >
              <option value="">All hosts</option>
              {hosts.map((h) => <option key={h} value={h}>{h}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Alerts</label>
            <select
              value={hadAlert}
              onChange={(e) => setHadAlert(e.target.value as 'all' | 'true' | 'false')}
              className="w-full min-h-[44px] rounded-lg border-2 border-slate-600 bg-slate-800 text-white px-3"
            >
              <option value="all">All</option>
              <option value="true">Only alerts</option>
              <option value="false">Only healthy</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Since</label>
            <input
              type="datetime-local"
              value={since}
              onChange={(e) => setSince(e.target.value)}
              className="w-full min-h-[44px] rounded-lg border-2 border-slate-600 bg-slate-800 text-white px-3"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Until</label>
            <input
              type="datetime-local"
              value={until}
              onChange={(e) => setUntil(e.target.value)}
              className="w-full min-h-[44px] rounded-lg border-2 border-slate-600 bg-slate-800 text-white px-3"
            />
          </div>
          <div className="flex items-end gap-2">
            <button
              onClick={applyFilters}
              className="flex-1 min-h-[44px] rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm"
            >Apply</button>
            <button
              onClick={reset}
              className="min-h-[44px] px-3 rounded-lg bg-slate-700 hover:bg-slate-600 text-white text-sm"
            >Reset</button>
          </div>
        </div>
      </div>

      {err && (
        <div className="rounded-lg border-2 border-red-700 bg-red-950/60 text-red-200 px-4 py-3 text-sm">
          {err}
        </div>
      )}

      {/* Rows */}
      <div className="rounded-xl border-2 border-slate-700 bg-slate-900 overflow-hidden">
        <div className="grid grid-cols-12 gap-2 px-4 py-2 bg-slate-800 text-xs uppercase text-slate-400">
          <div className="col-span-1" />
          <div className="col-span-3">Timestamp (UTC)</div>
          <div className="col-span-3">Host</div>
          <div className="col-span-1 text-center">HEAD</div>
          <div className="col-span-1 text-center">GET</div>
          <div className="col-span-1 text-center">Assets</div>
          <div className="col-span-1 text-center">Module</div>
          <div className="col-span-1 text-center">Status</div>
        </div>

        {loading && rows.length === 0 && (
          <div className="p-6 text-center text-slate-400 text-sm">Loading…</div>
        )}
        {!loading && rows.length === 0 && (
          <div className="p-6 text-center text-slate-400 text-sm">No rows match these filters.</div>
        )}

        {rows.map((r) => {
          const isOpen = expanded.has(r.id);
          const alerts = toArr(r.alerts);
          const info = toArr(r.info);
          const bundles = toArr(r.missing_bundles);
          return (
            <div key={r.id} className="border-t border-slate-800">
              <button
                onClick={() => toggle(r.id)}
                className="w-full grid grid-cols-12 gap-2 px-4 py-3 text-left text-sm text-slate-200 hover:bg-slate-800/60"
              >
                <div className="col-span-1 flex items-center">
                  {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                </div>
                <div className="col-span-3 font-mono text-xs">{fmt(r.created_at)}</div>
                <div className="col-span-3 truncate">{r.host}</div>
                <div className="col-span-1 text-center font-mono text-xs">{r.head_status ?? '—'}</div>
                <div className="col-span-1 text-center font-mono text-xs">{r.get_status ?? '—'}</div>
                <div className="col-span-1 text-center font-mono text-xs">
                  {r.assets_ok ?? '—'}/{r.assets_total ?? '—'}
                </div>
                <div className="col-span-1 text-center">
                  {r.has_module_entry ? '✅' : r.has_module_entry === false ? '❌' : '—'}
                </div>
                <div className="col-span-1 text-center">
                  {r.had_alert
                    ? <span className="inline-flex items-center gap-1 text-red-400"><AlertTriangle className="w-4 h-4" /></span>
                    : <span className="inline-flex items-center gap-1 text-emerald-400"><CheckCircle2 className="w-4 h-4" /></span>}
                </div>
              </button>

              {isOpen && (
                <div className="px-6 pb-4 pt-1 bg-slate-950/40 space-y-3 text-sm">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs text-slate-300">
                    <div><span className="text-slate-500">HEAD attempts:</span> {r.head_attempts ?? '—'}</div>
                    <div><span className="text-slate-500">GET attempts:</span> {r.get_attempts ?? '—'}</div>
                    <div><span className="text-slate-500">Source:</span> {r.source ?? '—'}</div>
                    <div className="truncate">
                      <span className="text-slate-500">Run:</span>{' '}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs text-slate-300">
                    <div><span className="text-slate-500">HEAD attempts:</span> {r.head_attempts ?? '—'}</div>
                    <div><span className="text-slate-500">GET attempts:</span> {r.get_attempts ?? '—'}</div>
                    <div><span className="text-slate-500">Source:</span> {r.source ?? '—'}</div>
                    <div className="truncate">
                      <span className="text-slate-500">Run:</span>{' '}
                      {r.run_url
                        ? <a href={r.run_url} target="_blank" rel="noreferrer" className="text-emerald-400 hover:underline">open</a>
                        : '—'}
                    </div>
                    <div><span className="text-slate-500">HEAD time:</span> {r.head_duration_ms != null ? `${r.head_duration_ms} ms` : '—'}</div>
                    <div><span className="text-slate-500">GET time:</span> {r.get_duration_ms != null ? `${r.get_duration_ms} ms` : '—'}</div>
                    <div><span className="text-slate-500">HTML bytes:</span> {r.html_bytes != null ? r.html_bytes.toLocaleString() : '—'}</div>
                    <div>
                      <span className="text-slate-500">Content-Type:</span>{' '}
                      {(r.get_headers as Record<string, string> | null)?.['content-type'] ?? '—'}
                    </div>
                  </div>

                  {(r.head_headers || r.get_headers) && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {(['HEAD headers', r.head_headers] as const).slice(0, 0)}
                      {[
                        { label: 'HEAD response headers', h: r.head_headers },
                        { label: 'GET response headers', h: r.get_headers },
                      ].map(({ label, h }) => h ? (
                        <div key={label}>
                          <div className="text-slate-400 text-xs uppercase mb-1">{label}</div>
                          <pre className="bg-slate-900 border border-slate-700 rounded p-3 text-[11px] text-slate-300 overflow-x-auto whitespace-pre-wrap">
{JSON.stringify(h, null, 2)}
                          </pre>
                        </div>
                      ) : null)}
                    </div>
                  )}

                  {toArr(r.asset_samples).length > 0 && (
                    <div>
                      <div className="text-slate-400 text-xs uppercase mb-1">Asset probe samples ({toArr(r.asset_samples).length})</div>
                      <div className="overflow-x-auto border border-slate-700 rounded">
                        <table className="w-full text-[11px] text-slate-300">
                          <thead className="bg-slate-800 text-slate-400 uppercase">
                            <tr>
                              <th className="text-left px-2 py-1">URL</th>
                              <th className="text-center px-2 py-1">Status</th>
                              <th className="text-center px-2 py-1">Time</th>
                              <th className="text-center px-2 py-1">Bytes</th>
                              <th className="text-left px-2 py-1">Content-Type</th>
                              <th className="text-left px-2 py-1">Cache</th>
                              <th className="text-center px-2 py-1">Module</th>
                            </tr>
                          </thead>
                          <tbody>
                            {toArr(r.asset_samples).map((raw, i) => {
                              const s = raw as {
                                url?: string; status?: number | null; duration_ms?: number | null;
                                bytes?: number | null; content_type?: string | null;
                                cache?: string | null; module?: boolean; attempts?: number;
                              };
                              const short = (s.url || '').split('/assets/')[1] || s.url || '—';
                              return (
                                <tr key={i} className="border-t border-slate-800">
                                  <td className="px-2 py-1 font-mono">/assets/{short}</td>
                                  <td className="px-2 py-1 text-center font-mono">{s.status ?? '—'}</td>
                                  <td className="px-2 py-1 text-center">{s.duration_ms != null ? `${s.duration_ms}ms` : '—'}{s.attempts && s.attempts > 1 ? ` ×${s.attempts}` : ''}</td>
                                  <td className="px-2 py-1 text-center">{s.bytes != null ? s.bytes.toLocaleString() : '—'}</td>
                                  <td className="px-2 py-1 truncate max-w-[220px]">{s.content_type ?? '—'}</td>
                                  <td className="px-2 py-1 truncate max-w-[120px]">{s.cache ?? '—'}</td>
                                  <td className="px-2 py-1 text-center">{s.module ? '✅' : '—'}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {alerts.length > 0 && (
                    <div>
                      <div className="text-red-400 text-xs uppercase mb-1">Alerts ({alerts.length})</div>
                      <ul className="list-disc list-inside text-red-200 text-xs space-y-0.5">
                        {alerts.map((a, i) => <li key={i}>{typeof a === 'string' ? a : JSON.stringify(a)}</li>)}
                      </ul>
                    </div>
                  )}

                  {info.length > 0 && (
                    <div>
                      <div className="text-slate-400 text-xs uppercase mb-1">Info</div>
                      <ul className="list-disc list-inside text-slate-300 text-xs space-y-0.5">
                        {info.map((a, i) => <li key={i}>{typeof a === 'string' ? a : JSON.stringify(a)}</li>)}
                      </ul>
                    </div>
                  )}

                  {bundles.length > 0 && (
                    <div>
                      <div className="text-amber-400 text-xs uppercase mb-1">Missing bundles ({bundles.length})</div>
                      <pre className="bg-slate-900 border border-slate-700 rounded p-3 text-xs text-amber-200 overflow-x-auto whitespace-pre-wrap">
{JSON.stringify(bundles, null, 2)}
                      </pre>
                    </div>
                  )}

                  {r.html_snippet && (
                    <div>
                      <div className="text-slate-400 text-xs uppercase mb-1">HTML snippet (first ~2 KB)</div>
                      <pre className="bg-slate-900 border border-slate-700 rounded p-3 text-xs text-slate-300 overflow-x-auto max-h-64 whitespace-pre-wrap">
{r.html_snippet}
                      </pre>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between text-sm text-slate-400">
        <div>
          Page {Math.floor(offset / PAGE_SIZE) + 1} of {Math.max(1, Math.ceil(total / PAGE_SIZE))}
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
            disabled={offset === 0 || loading}
            className="px-3 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-white disabled:opacity-50"
          >Prev</button>
          <button
            onClick={() => setOffset(offset + PAGE_SIZE)}
            disabled={offset + PAGE_SIZE >= total || loading}
            className="px-3 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-white disabled:opacity-50"
          >Next</button>
        </div>
      </div>
    </div>
  );
}
