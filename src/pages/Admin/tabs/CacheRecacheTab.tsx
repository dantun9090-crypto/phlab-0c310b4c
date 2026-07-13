import { useCallback, useEffect, useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import {
  Loader2,
  Trash2,
  Zap,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Cloud,
  RefreshCw,
  Clock,
  Save,
  History,
  FileText,
  Image as ImageIcon,
  Globe,
} from 'lucide-react';
import {
  purgeCloudflareCache,
  recacheSitemapPrerender,
  listPurgeHistory,
  type PurgeHistoryRow,
} from '@/lib/cache-admin.functions';
import { getCacheConfig, setCacheConfig } from '@/lib/cache-config.functions';
import { CACHE_TTL_OPTIONS, DEFAULT_HTML_TTL_SECONDS } from '@/lib/cache-config-shared';

import { getAdminIdToken } from '@/lib/auth-ready';

type PurgeScope = 'all' | 'html' | 'assets' | 'files';

interface OpResult {
  kind: 'purge' | 'recache' | 'config';
  ok: boolean;
  detail: string;
  at: string;
}


export default function CacheRecacheTab() {
  const purgeFn = useServerFn(purgeCloudflareCache);
  const recacheFn = useServerFn(recacheSitemapPrerender);
  const getCfg = useServerFn(getCacheConfig);
  const setCfg = useServerFn(setCacheConfig);
  const listHistoryFn = useServerFn(listPurgeHistory);

  const [purging, setPurging] = useState(false);
  const [recaching, setRecaching] = useState(false);
  const [filesText, setFilesText] = useState('');
  const [includeMobile, setIncludeMobile] = useState(true);
  const [log, setLog] = useState<OpResult[]>([]);
  const [scope, setScope] = useState<Exclude<PurgeScope, 'files'>>('all');
  const [runSmoke, setRunSmoke] = useState(true);
  const [history, setHistory] = useState<PurgeHistoryRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);


  // HTML edge-cache TTL state
  const [ttl, setTtl] = useState<number>(DEFAULT_HTML_TTL_SECONDS);
  const [savedTtl, setSavedTtl] = useState<number>(DEFAULT_HTML_TTL_SECONDS);
  const [ttlUpdatedAt, setTtlUpdatedAt] = useState<string | null>(null);
  const [ttlUpdatedBy, setTtlUpdatedBy] = useState<string | null>(null);
  const [loadingTtl, setLoadingTtl] = useState(true);
  const [savingTtl, setSavingTtl] = useState(false);

  const pushLog = (entry: OpResult) =>
    setLog((prev) => [entry, ...prev].slice(0, 20));

  useEffect(() => {
    (async () => {
      try {
        const idToken = await getAdminIdToken();
        const res = await getCfg({ data: { idToken } });
        if (res.ok) {
          setTtl(res.htmlTtlSeconds);
          setSavedTtl(res.htmlTtlSeconds);
          setTtlUpdatedAt(res.updatedAt);
          setTtlUpdatedBy(res.updatedBy);
        }
      } catch (e) {
        pushLog({
          kind: 'config',
          ok: false,
          detail: e instanceof Error ? e.message : String(e),
          at: new Date().toISOString(),
        });
      } finally {
        setLoadingTtl(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const saveTtl = async () => {
    if (ttl !== 0) {
      if (!confirm(
        'Enabling the HTML edge cache means returning visitors may see stale HTML referencing old /assets/*.js after a publish — which causes blank pages. The post-publish hook will purge automatically, but if the purge fails users could be stuck on a stale shell. Continue?',
      )) return;
    }
    setSavingTtl(true);
    try {
      const idToken = await getAdminIdToken();
      const res = await setCfg({ data: { idToken, htmlTtlSeconds: ttl } });
      setSavedTtl(res.htmlTtlSeconds);
      setTtlUpdatedAt(res.updatedAt);
      setTtlUpdatedBy(res.updatedBy);
      pushLog({
        kind: 'config',
        ok: true,
        detail: `TTL set to ${labelForTtl(res.htmlTtlSeconds)} — purge ${res.purge.ok ? 'OK' : 'FAILED'} (HTTP ${res.purge.status})`,
        at: new Date().toISOString(),
      });
    } catch (e) {
      pushLog({
        kind: 'config',
        ok: false,
        detail: e instanceof Error ? e.message : String(e),
        at: new Date().toISOString(),
      });
    } finally {
      setSavingTtl(false);
    }
  };

  function labelForTtl(v: number): string {
    return CACHE_TTL_OPTIONS.find((o) => o.value === v)?.label ?? `${v}s`;
  }


  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const idToken = await getAdminIdToken();
      const res = await listHistoryFn({ data: { idToken, limit: 50 } });
      if (res.ok) setHistory(res.rows);
    } catch {
      /* swallow — surfaced by next manual reload */
    } finally {
      setHistoryLoading(false);
    }
  }, [listHistoryFn]);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  function describePurgeResult(
    res: Awaited<ReturnType<typeof purgeFn>>,
  ): string {
    const base = res.ok
      ? `Purged scope=${res.scope}${res.fileCount ? ` (${res.fileCount} file(s))` : ''} — HTTP ${res.status}, ${('durationMs' in res ? res.durationMs : 0)} ms`
      : `Failed scope=${res.scope}: ${('error' in res && res.error) || ('response' in res ? res.response : '')} (HTTP ${res.status})`;
    const smoke = 'smoke' in res && res.smoke
      ? res.smoke.ok
        ? ' — smoke OK'
        : ` — smoke FAILED (${res.smoke.failures.join('; ')})`
      : '';
    const note = ('scopeNote' in res && res.scopeNote) ? res.scopeNote : '';
    return base + smoke + note;
  }

  const runScopedPurge = async () => {
    const labels: Record<typeof scope, string> = {
      all: 'the ENTIRE Cloudflare cache (HTML + assets)',
      html: 'top HTML routes only (sitemap-derived, up to 30)',
      assets: 'asset cache (Pro plan: falls back to purge_everything)',
    };
    if (!confirm(`Purge ${labels[scope]} for phlabs.co.uk?`)) return;
    setPurging(true);
    try {
      const idToken = await getAdminIdToken();
      const res = await purgeFn({
        data: { idToken, scope, runSmokeTest: runSmoke },
      });
      pushLog({
        kind: 'purge',
        ok: res.ok && (!('smoke' in res) || !res.smoke || res.smoke.ok),
        detail: describePurgeResult(res),
        at: new Date().toISOString(),
      });
      void loadHistory();
    } catch (e) {
      pushLog({
        kind: 'purge',
        ok: false,
        detail: e instanceof Error ? e.message : String(e),
        at: new Date().toISOString(),
      });
    } finally {
      setPurging(false);
    }
  };

  const runPurgeFiles = async () => {
    const files = filesText
      .split(/\s+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (files.length === 0) {
      alert('Paste at least one full URL (one per line, https://phlabs.co.uk/...).');
      return;
    }
    setPurging(true);
    try {
      const idToken = await getAdminIdToken();
      const res = await purgeFn({
        data: { idToken, scope: 'files', files, runSmokeTest: false },
      });
      pushLog({
        kind: 'purge',
        ok: res.ok,
        detail: describePurgeResult(res),
        at: new Date().toISOString(),
      });
      void loadHistory();
    } catch (e) {
      pushLog({
        kind: 'purge',
        ok: false,
        detail: e instanceof Error ? e.message : String(e),
        at: new Date().toISOString(),
      });
    } finally {
      setPurging(false);
    }
  };


  const runRecache = async () => {
    setRecaching(true);
    try {
      const idToken = await getAdminIdToken();
      const res = await recacheFn({ data: { idToken, includeMobile } });
      pushLog({
        kind: 'recache',
        ok: res.ok,
        detail: res.ok
          ? `Queued ${res.urls} URL(s) — desktop HTTP ${res.desktop?.status}${res.mobile ? `, mobile HTTP ${res.mobile.status}` : ''}`
          : `Failed: ${('error' in res && res.error) || 'see logs'} (urls=${res.urls})`,
        at: new Date().toISOString(),
      });
    } catch (e) {
      pushLog({
        kind: 'recache',
        ok: false,
        detail: e instanceof Error ? e.message : String(e),
        at: new Date().toISOString(),
      });
    } finally {
      setRecaching(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <div>
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          <Cloud className="w-5 h-5 text-blue-400" />
          Cache &amp; Recache
        </h2>
        <p className="text-sm text-[#9cb8d9] mt-1">
          Purge Cloudflare edge cache and trigger Prerender.io to rebuild every URL from{' '}
          <code className="text-emerald-400">/sitemap.xml</code>. Every Lovable Publish auto-fires
          a full Cloudflare purge + Prerender desktop/mobile recache on first visitor request
          (build-id compared server-side via <code className="text-emerald-400">/api/public/post-publish-check</code>).
          Public HTML cache is admin-controlled: <strong>Off</strong> (default), 30s or 1min.
          When Off, every HTML response is served with <code>no-store</code> so stale shells cannot stick.
          Private routes, service workers, recovery URLs, and 404 HTML stay no-store regardless of the setting.
          Use the buttons below for ad-hoc purges or to re-trigger manually.
        </p>
      </div>

      {/* HTML edge-cache TTL */}
      <div className="bg-[#0b1a30]/70 border border-white/[0.07] rounded-xl p-4 space-y-3">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0">
            <Clock className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-white">HTML edge-cache TTL</h3>
            <p className="text-xs text-[#9cb8d9] mt-1">
              Controls how long Cloudflare keeps cacheable HTML before re-fetching the origin. Keep this Off during publishes/debugging.
              The setting is read by both the origin (<code className="text-emerald-400">src/server.ts</code>) and the{' '}
              <code className="text-emerald-400">phlabs-prerender</code> Worker (60s in-memory config cache per cold start).
              Saving the TTL also fires a full Cloudflare cache purge so the new value takes effect immediately.
            </p>
            <p className="text-xs text-amber-300/90 mt-2 flex items-start gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span><strong>Default is Off</strong> (no cache). Any HTML cache can make a fresh publish look unchanged until Cloudflare purges. Use <strong>Off</strong> while debugging publishes.</span>
            </p>
          </div>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-end">
          <label className="flex-1">
            <span className="block text-xs text-[#9cb8d9] mb-1">Current setting</span>
            <select
              value={ttl}
              onChange={(e) => setTtl(parseInt(e.target.value, 10))}
              disabled={loadingTtl || savingTtl}
              className="w-full min-h-[48px] px-3 py-2 bg-slate-800 border-2 border-slate-600 rounded-lg text-white text-sm focus:border-emerald-500 outline-none disabled:opacity-50"
            >
              {CACHE_TTL_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </label>
          <button
            onClick={saveTtl}
            disabled={loadingTtl || savingTtl || ttl === savedTtl}
            className="sm:w-auto min-h-[48px] px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white rounded-lg text-sm font-semibold transition-colors flex items-center justify-center gap-2"
          >
            {savingTtl ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save &amp; purge
          </button>
        </div>
        <div className="text-xs text-[#9cb8d9]">
          {loadingTtl ? (
            <span className="text-slate-500">Loading current setting…</span>
          ) : (
            <>
              Active: <span className="text-emerald-400 font-semibold">{labelForTtl(savedTtl)}</span>
              {ttlUpdatedAt && (
                <>
                  {' '}— last changed {new Date(ttlUpdatedAt).toLocaleString('en-GB')}
                  {ttlUpdatedBy ? ` by ${ttlUpdatedBy}` : ''}
                </>
              )}
            </>
          )}
        </div>
      </div>



      {/* Cloudflare scoped purge */}
      <div className="bg-[#0b1a30]/70 border border-white/[0.07] rounded-xl p-4 space-y-3">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center justify-center shrink-0">
            <Trash2 className="w-4 h-4 text-red-400" />
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-white">Purge Cloudflare cache — choose scope</h3>
            <p className="text-xs text-[#9cb8d9] mt-1">
              Calls <code className="text-emerald-400">POST /zones/{`{zone}`}/purge_cache</code>. A post-purge smoke
              test fetches <code>/</code>, <code>/products</code> and a product page, asserts HTTP 200 and verifies
              GA/Ads beacons are still rendered. Failures and timeouts trigger a Telegram alert.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {([
            { v: 'all', label: 'Full purge', desc: 'HTML + assets', Icon: Globe },
            { v: 'html', label: 'HTML only', desc: 'Top 30 pages', Icon: FileText },
            { v: 'assets', label: 'Assets only', desc: 'Pro plan: full', Icon: ImageIcon },
          ] as const).map(({ v, label, desc, Icon }) => {
            const active = scope === v;
            return (
              <button
                key={v}
                type="button"
                onClick={() => setScope(v)}
                className={`text-left p-3 rounded-lg border-2 transition-colors ${
                  active
                    ? 'border-red-500 bg-red-500/10'
                    : 'border-slate-700 hover:border-slate-500 bg-slate-800/40'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Icon className={`w-4 h-4 ${active ? 'text-red-300' : 'text-slate-400'}`} />
                  <span className="text-sm font-semibold text-white">{label}</span>
                </div>
                <div className="text-[11px] text-[#9cb8d9] mt-1">{desc}</div>
              </button>
            );
          })}
        </div>

        <label className="flex items-center gap-2 text-xs text-[#9cb8d9]">
          <input
            type="checkbox"
            checked={runSmoke}
            onChange={(e) => setRunSmoke(e.target.checked)}
            className="w-4 h-4 accent-red-500"
          />
          Run post-purge smoke test (HTML 200 + GA/Ads beacons present)
        </label>

        <button
          onClick={runScopedPurge}
          disabled={purging}
          className="w-full sm:w-auto min-h-[48px] px-4 py-2 bg-red-600 hover:bg-red-500 disabled:opacity-40 text-white rounded-lg text-sm font-semibold transition-colors flex items-center justify-center gap-2"
        >
          {purging ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
          Purge ({scope})
        </button>
      </div>


      {/* Cloudflare selective purge */}
      <div className="bg-[#0b1a30]/70 border border-white/[0.07] rounded-xl p-4 space-y-3">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center shrink-0">
            <RefreshCw className="w-4 h-4 text-blue-400" />
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-white">Purge specific URLs</h3>
            <p className="text-xs text-[#9cb8d9] mt-1">
              One URL per line. Max 30. Only <code className="text-emerald-400">https://phlabs.co.uk/*</code> and{' '}
              <code className="text-emerald-400">https://www.phlabs.co.uk/*</code> accepted.
            </p>
          </div>
        </div>
        <textarea
          value={filesText}
          onChange={(e) => setFilesText(e.target.value)}
          rows={4}
          placeholder={`https://phlabs.co.uk/\nhttps://phlabs.co.uk/products\nhttps://phlabs.co.uk/products/bpc-157`}
          className="w-full min-h-[120px] px-3 py-2 bg-slate-800 border-2 border-slate-600 rounded-lg text-white text-sm font-mono placeholder:text-slate-500 focus:border-blue-500 outline-none"
        />
        <button
          onClick={runPurgeFiles}
          disabled={purging || !filesText.trim()}
          className="w-full sm:w-auto min-h-[48px] px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white rounded-lg text-sm font-semibold transition-colors flex items-center justify-center gap-2"
        >
          {purging ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          Purge listed URLs
        </button>
      </div>

      {/* Prerender bulk recache */}
      <div className="bg-[#0b1a30]/70 border border-white/[0.07] rounded-xl p-4 space-y-3">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0">
            <Zap className="w-4 h-4 text-amber-400" />
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-white">Recache every sitemap URL in Prerender.io</h3>
            <p className="text-xs text-[#9cb8d9] mt-1">
              Reads <code className="text-emerald-400">/sitemap.xml</code>, then POSTs the URL list to{' '}
              <code className="text-emerald-400">https://api.prerender.io/recache</code>. Used after a Publish so
              Googlebot sees the new build immediately instead of waiting for the next 15-min cron.
            </p>
          </div>
        </div>
        <label className="flex items-center gap-2 text-xs text-[#9cb8d9]">
          <input
            type="checkbox"
            checked={includeMobile}
            onChange={(e) => setIncludeMobile(e.target.checked)}
            className="w-4 h-4 accent-amber-500"
          />
          Also recache mobile snapshots (<code className="text-emerald-400">adaptiveType=mobile</code>)
        </label>
        <button
          onClick={runRecache}
          disabled={recaching}
          className="w-full sm:w-auto min-h-[48px] px-4 py-2 bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-white rounded-lg text-sm font-semibold transition-colors flex items-center justify-center gap-2"
        >
          {recaching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
          Recache sitemap
        </button>
      </div>

      {/* Recent activity */}
      {log.length > 0 && (
        <div className="bg-[#0b1a30]/70 border border-white/[0.07] rounded-xl p-4">
          <h3 className="text-sm font-semibold text-white mb-2">Recent activity</h3>
          <div className="space-y-1.5">
            {log.map((l, i) => (
              <div key={i} className="flex items-start gap-2 text-xs">
                {l.ok ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 mt-0.5 shrink-0" />
                ) : (
                  <XCircle className="w-3.5 h-3.5 text-red-400 mt-0.5 shrink-0" />
                )}
                <span className="text-[#9cb8d9] uppercase font-semibold w-16 shrink-0">{l.kind}</span>
                <span className="text-white flex-1 break-words">{l.detail}</span>
                <span className="text-[#3a5a82] shrink-0">
                  {new Date(l.at).toLocaleTimeString('en-GB')}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Persistent purge history (Firestore) */}
      <div className="bg-[#0b1a30]/70 border border-white/[0.07] rounded-xl p-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <History className="w-4 h-4 text-[#9cb8d9]" />
            Purge history
            <span className="text-[11px] text-[#9cb8d9] font-normal">
              (last {history.length} entries · Firestore)
            </span>
          </h3>
          <button
            onClick={() => void loadHistory()}
            disabled={historyLoading}
            className="text-xs px-2 py-1 border border-slate-600 rounded hover:bg-slate-700 disabled:opacity-40 flex items-center gap-1 text-[#9cb8d9]"
          >
            {historyLoading ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <RefreshCw className="w-3 h-3" />
            )}
            Refresh
          </button>
        </div>
        {history.length === 0 ? (
          <p className="text-xs text-[#9cb8d9]">No purges recorded yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-[#9cb8d9] border-b border-white/10">
                  <th className="py-2 pr-3">When</th>
                  <th className="py-2 pr-3">Scope</th>
                  <th className="py-2 pr-3">Result</th>
                  <th className="py-2 pr-3">Smoke</th>
                  <th className="py-2 pr-3">Duration</th>
                  <th className="py-2 pr-3">By</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h) => (
                  <tr key={h.id} className="border-b border-white/[0.04]">
                    <td className="py-2 pr-3 text-white whitespace-nowrap">
                      {new Date(h.at).toLocaleString('en-GB')}
                    </td>
                    <td className="py-2 pr-3 text-white font-mono">{h.scope}</td>
                    <td className="py-2 pr-3">
                      {h.ok ? (
                        <span className="text-emerald-400 inline-flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" /> {h.status}
                          {h.fileCount > 0 ? ` · ${h.fileCount} files` : ''}
                        </span>
                      ) : (
                        <span className="text-red-400 inline-flex items-center gap-1" title={h.error}>
                          <XCircle className="w-3 h-3" /> {h.status || 'ERR'}
                        </span>
                      )}
                    </td>
                    <td className="py-2 pr-3">
                      {h.smoke ? (
                        h.smoke.ok ? (
                          <span className="text-emerald-400">OK</span>
                        ) : (
                          <span
                            className="text-amber-400"
                            title={h.smoke.failures.join('\n')}
                          >
                            {h.smoke.failures.length} fail
                          </span>
                        )
                      ) : (
                        <span className="text-[#3a5a82]">—</span>
                      )}
                    </td>
                    <td className="py-2 pr-3 text-[#9cb8d9]">{h.durationMs} ms</td>
                    <td className="py-2 pr-3 text-[#9cb8d9] truncate max-w-[180px]" title={h.triggeredBy}>
                      {h.triggeredBy}
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
