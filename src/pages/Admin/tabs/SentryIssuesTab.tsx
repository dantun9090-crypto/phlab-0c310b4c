import { useState, type ReactNode } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { auth } from '@/lib/firebase';
import { fetchSentryIssues, fetchSentryIssueDetails, fetchSentryFilters } from '@/lib/sentry-issues.functions';
import { AlertTriangle, ExternalLink, RefreshCw, X } from 'lucide-react';

interface SentryIssue {
  id: string;
  shortId: string;
  title: string;
  culprit?: string;
  level: string;
  status: string;
  count: string;
  userCount: number;
  firstSeen: string;
  lastSeen: string;
  permalink: string;
}

export default function SentryIssuesTab() {
  const call = useServerFn(fetchSentryIssues);
  const callDetails = useServerFn(fetchSentryIssueDetails);
  const callFilters = useServerFn(fetchSentryFilters);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [issues, setIssues] = useState<SentryIssue[]>([]);
  const [meta, setMeta] = useState<{ orgSlug?: string; projectSlug?: string; statsPeriod?: string } | null>(null);
  const [period, setPeriod] = useState('24h');
  const [environment, setEnvironment] = useState<string>('');
  const [release, setRelease] = useState<string>('');
  const [envOptions, setEnvOptions] = useState<string[]>([]);
  const [releaseOptions, setReleaseOptions] = useState<Array<{ version: string; shortVersion: string }>>([]);
  const [filtersLoading, setFiltersLoading] = useState(false);
  const [detail, setDetail] = useState<any | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  async function loadFilters() {
    setFiltersLoading(true);
    try {
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) throw new Error('Not signed in.');
      const res = await callFilters({ data: { idToken } });
      if (res.ok) {
        setEnvOptions(res.environments);
        setReleaseOptions(res.releases);
      }
    } catch {
      /* silent */
    } finally {
      setFiltersLoading(false);
    }
  }

  async function openDetails(issueId: string) {
    setDetail({ __placeholder: true, id: issueId });
    setDetailLoading(true);
    setDetailError(null);
    try {
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) throw new Error('Not signed in.');
      const res = await callDetails({ data: { idToken, issueId } });
      if (!res.ok) {
        setDetailError(res.error || 'Unknown error');
        setDetail(null);
      } else {
        setDetail(res);
      }
    } catch (e: any) {
      setDetailError(e?.message || String(e));
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  }

  async function load(limitOverride?: number) {
    setLoading(true);
    setError(null);
    try {
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) throw new Error('Not signed in.');
      const res = await call({
        data: {
          idToken,
          statsPeriod: period,
          limit: limitOverride ?? 50,
          ...(environment ? { environment } : {}),
          ...(release ? { release } : {}),
        },
      });
      if (!res.ok) {
        setError(res.error || 'Unknown error');
        setIssues([]);
      } else {
        setIssues(res.issues as SentryIssue[]);
        setMeta({ orgSlug: res.orgSlug, projectSlug: res.projectSlug, statsPeriod: res.statsPeriod });
      }
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  const levelColor = (l: string) =>
    l === 'error' || l === 'fatal' ? 'text-red-400' : l === 'warning' ? 'text-amber-400' : 'text-slate-400';

  return (
    <div className="p-6 space-y-4 text-white">
      <div className="flex items-center gap-3">
        <AlertTriangle className="w-6 h-6 text-red-400" />
        <h2 className="text-2xl font-bold">Sentry Issues</h2>
      </div>
      <p className="text-slate-400 text-sm">
        Unresolved errors from the frontend + backend Sentry project. Uses{' '}
        <code className="text-emerald-400">SENTRY_AUTH_TOKEN</code> on the server; token is never exposed.
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm text-slate-300">Range:</label>
        <select
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
          className="bg-slate-800 border-2 border-slate-600 text-white rounded-lg px-3 py-2 min-h-[44px]"
        >
          <option value="1h">Last 1 hour</option>
          <option value="24h">Last 24 hours</option>
          <option value="7d">Last 7 days</option>
          <option value="14d">Last 14 days</option>
          <option value="30d">Last 30 days</option>
        </select>
        <select
          value={environment}
          onChange={(e) => setEnvironment(e.target.value)}
          className="bg-slate-800 border-2 border-slate-600 text-white rounded-lg px-3 py-2 min-h-[44px]"
          title="Environment"
        >
          <option value="">All environments</option>
          {envOptions.map((e) => (
            <option key={e} value={e}>{e}</option>
          ))}
        </select>
        <select
          value={release}
          onChange={(e) => setRelease(e.target.value)}
          className="bg-slate-800 border-2 border-slate-600 text-white rounded-lg px-3 py-2 min-h-[44px] max-w-[220px]"
          title="Release"
        >
          <option value="">All releases</option>
          {releaseOptions.map((r) => (
            <option key={r.version} value={r.version}>{r.shortVersion}</option>
          ))}
        </select>
        <button
          onClick={loadFilters}
          disabled={filtersLoading}
          className="text-xs text-slate-300 hover:text-white underline disabled:opacity-50"
        >
          {filtersLoading ? 'Loading…' : envOptions.length || releaseOptions.length ? 'Refresh filters' : 'Load filters'}
        </button>
        <button
          onClick={() => load()}
          disabled={loading}
          className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg font-medium disabled:opacity-50 min-h-[44px]"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          {loading ? 'Loading…' : 'Fetch issues'}
        </button>
        <button
          onClick={() => load(20)}
          disabled={loading}
          className="inline-flex items-center gap-2 bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded-lg font-medium disabled:opacity-50 min-h-[44px]"
        >
          Fetch last 20 now
        </button>
        {meta?.orgSlug && (
          <a
            href={`https://${meta.orgSlug}.sentry.io/issues/?project=&statsPeriod=${meta.statsPeriod}`}
            target="_blank"
            rel="noreferrer"
            className="text-sm text-emerald-400 hover:underline inline-flex items-center gap-1"
          >
            Open in Sentry <ExternalLink className="w-3 h-3" />
          </a>
        )}
      </div>

      {error && (
        <div className="bg-red-900/30 border-2 border-red-700 text-red-200 rounded-lg p-4 text-sm whitespace-pre-wrap">
          {error}
        </div>
      )}

      {!error && issues.length === 0 && !loading && (
        <div className="text-slate-400 text-sm">No results yet — click "Fetch issues".</div>
      )}

      {issues.length > 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-800 text-slate-300">
              <tr>
                <th className="text-left px-4 py-3">Issue</th>
                <th className="text-left px-4 py-3">Level</th>
                <th className="text-right px-4 py-3">Events</th>
                <th className="text-right px-4 py-3">Users</th>
                <th className="text-left px-4 py-3">Last seen</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {issues.map((i) => (
                <tr
                  key={i.id}
                  onClick={() => openDetails(i.id)}
                  className="border-t border-slate-800 hover:bg-slate-800/50 cursor-pointer"
                >
                  <td className="px-4 py-3">
                    <div className="font-medium">{i.title}</div>
                    {i.culprit && <div className="text-xs text-slate-400 mt-0.5">{i.culprit}</div>}
                    <div className="text-xs text-slate-500 mt-0.5">{i.shortId}</div>
                  </td>
                  <td className={`px-4 py-3 ${levelColor(i.level)} font-mono`}>{i.level}</td>
                  <td className="px-4 py-3 text-right font-mono">{i.count}</td>
                  <td className="px-4 py-3 text-right font-mono">{i.userCount}</td>
                  <td className="px-4 py-3 text-xs text-slate-400">
                    {new Date(i.lastSeen).toLocaleString('en-GB')}
                  </td>
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    <a
                      href={i.permalink}
                      target="_blank"
                      rel="noreferrer"
                      className="text-emerald-400 hover:underline inline-flex items-center gap-1"
                    >
                      Open <ExternalLink className="w-3 h-3" />
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {detail && (
        <div
          className="fixed inset-0 z-50 bg-black/70 flex items-start justify-center overflow-y-auto p-4"
          onClick={() => !detailLoading && setDetail(null)}
        >
          <div
            className="bg-slate-900 border-2 border-slate-700 rounded-xl w-full max-w-4xl my-8 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between border-b border-slate-800 p-4 gap-3">
              <div className="min-w-0">
                <div className="text-xs text-slate-500 font-mono">{detail.issue?.shortId ?? '…'}</div>
                <h3 className="text-lg font-bold text-white break-words">
                  {detailLoading && detail.__placeholder ? 'Loading issue…' : detail.issue?.title}
                </h3>
                {detail.issue?.culprit && (
                  <div className="text-xs text-slate-400 mt-1 break-words">{detail.issue.culprit}</div>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {detail.issue?.permalink && (
                  <a
                    href={detail.issue.permalink}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-emerald-400 hover:underline inline-flex items-center gap-1"
                  >
                    Sentry <ExternalLink className="w-3 h-3" />
                  </a>
                )}
                <button
                  onClick={() => setDetail(null)}
                  className="text-slate-400 hover:text-white p-1 rounded"
                  aria-label="Close"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="p-4 space-y-4 text-sm">
              {detailError && (
                <div className="bg-red-900/30 border-2 border-red-700 text-red-200 rounded-lg p-3 whitespace-pre-wrap">
                  {detailError}
                </div>
              )}
              {detailLoading && (
                <div className="text-slate-400 flex items-center gap-2">
                  <RefreshCw className="w-4 h-4 animate-spin" /> Fetching latest event…
                </div>
              )}

              {detail.issue && !detailLoading && (
                <>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <Stat label="Level" value={detail.issue.level} />
                    <Stat label="Events" value={detail.issue.count} />
                    <Stat label="Users" value={detail.issue.userCount} />
                    <Stat
                      label="First release"
                      value={detail.issue.firstRelease?.shortVersion || detail.issue.firstRelease?.version || '—'}
                    />
                    <Stat
                      label="Last release"
                      value={detail.issue.lastRelease?.shortVersion || detail.issue.lastRelease?.version || '—'}
                    />
                    <Stat
                      label="Env"
                      value={detail.event?.environment || detail.event?.tags?.environment || '—'}
                    />
                    <Stat label="First seen" value={new Date(detail.issue.firstSeen).toLocaleString('en-GB')} />
                    <Stat label="Last seen" value={new Date(detail.issue.lastSeen).toLocaleString('en-GB')} />
                  </div>

                  {detail.event?.message && (
                    <div>
                      <div className="text-xs text-slate-400 mb-1">Message</div>
                      <pre className="bg-slate-950 border border-slate-800 rounded-lg p-3 text-xs whitespace-pre-wrap text-slate-200">
                        {detail.event.message}
                      </pre>
                    </div>
                  )}

                  {detail.event?.exceptions?.length > 0 && (
                    <div className="space-y-3">
                      <div className="text-xs text-slate-400">Stack trace</div>
                      {detail.event.exceptions.map((ex: any, idx: number) => (
                        <div key={idx} className="bg-slate-950 border border-slate-800 rounded-lg overflow-hidden">
                          <div className="px-3 py-2 bg-slate-800/60 text-xs font-mono">
                            <span className="text-red-400">{ex.type}</span>
                            {ex.value ? <span className="text-slate-300">: {ex.value}</span> : null}
                          </div>
                          <div className="divide-y divide-slate-800">
                            {ex.frames
                              .slice()
                              .reverse()
                              .map((f: any, fi: number) => (
                                <div key={fi} className={`px-3 py-2 text-xs font-mono ${f.inApp ? 'text-slate-200' : 'text-slate-500'}`}>
                                  <div className="truncate">
                                    <span className="text-emerald-400">{f.function || '<anonymous>'}</span>
                                    {f.filename ? <span> — {f.filename}</span> : null}
                                    {f.lineNo ? <span className="text-slate-500">:{f.lineNo}{f.colNo ? `:${f.colNo}` : ''}</span> : null}
                                  </div>
                                </div>
                              ))}
                            {ex.frames.length === 0 && (
                              <div className="px-3 py-2 text-xs text-slate-500">No frames available.</div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {detail.event?.tags && Object.keys(detail.event.tags).length > 0 && (
                    <div>
                      <div className="text-xs text-slate-400 mb-1">Tags</div>
                      <div className="flex flex-wrap gap-1.5">
                        {Object.entries(detail.event.tags).map(([k, v]) => (
                          <span
                            key={k}
                            className="text-[11px] font-mono bg-slate-800 border border-slate-700 rounded px-2 py-0.5 text-slate-300"
                          >
                            {k}={String(v)}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="bg-slate-950 border border-slate-800 rounded-lg p-2">
      <div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className="text-sm text-white font-mono truncate">{value}</div>
    </div>
  );
}
