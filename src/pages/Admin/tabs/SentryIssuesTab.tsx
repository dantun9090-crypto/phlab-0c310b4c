import { useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { auth } from '@/lib/firebase';
import { fetchSentryIssues } from '@/lib/sentry-issues.functions';
import { AlertTriangle, ExternalLink, RefreshCw } from 'lucide-react';

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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [issues, setIssues] = useState<SentryIssue[]>([]);
  const [meta, setMeta] = useState<{ orgSlug?: string; projectSlug?: string; statsPeriod?: string } | null>(null);
  const [period, setPeriod] = useState('24h');

  async function load(limitOverride?: number) {
    setLoading(true);
    setError(null);
    try {
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) throw new Error('Not signed in.');
      const res = await call({ data: { idToken, statsPeriod: period, limit: limitOverride ?? 50 } });
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
        <button
          onClick={load}
          disabled={loading}
          className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg font-medium disabled:opacity-50 min-h-[44px]"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          {loading ? 'Loading…' : 'Fetch issues'}
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
                <tr key={i.id} className="border-t border-slate-800 hover:bg-slate-800/50">
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
                  <td className="px-4 py-3">
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
    </div>
  );
}
