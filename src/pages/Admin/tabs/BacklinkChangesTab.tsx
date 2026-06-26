/**
 * Backlink Changes — weekly Semrush diff dashboard.
 *
 * Reads snapshots persisted by the backlink-watcher cron and shows:
 *   - Current Authority Score, refdomain count, follow/nofollow ratio
 *   - "New since last run" + "Lost since last run"
 *   - Spam-pattern alerts (auto-flagged)
 *   - Run history with per-run reasons
 *
 * Triggers a fresh run on demand via runBacklinkWatcherNow.
 */
import { useEffect, useState, useCallback } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { Loader2, RefreshCw, AlertTriangle, TrendingDown, TrendingUp, ExternalLink } from 'lucide-react';
import { auth } from '@/lib/firebase';
import {
  listBacklinkSnapshots,
  runBacklinkWatcherNow,
} from '@/lib/backlink-watcher.functions';

interface RefDomain {
  domain: string;
  ascore: number | null;
  backlinks_num: number | null;
  country: string | null;
  first_seen: string | null;
  last_seen: string | null;
}
interface Snapshot {
  fetchedAt: string;
  ascore: number | null;
  total: number | null;
  domains_num: number | null;
  follows_num: number | null;
  nofollows_num: number | null;
  refdomains: RefDomain[];
}
interface HistoryRun extends Snapshot {
  id: string;
  diff: {
    newDomains: RefDomain[];
    lostDomains: RefDomain[];
    ascoreDelta: number | null;
    domainsDelta: number | null;
    spamNewDomains: RefDomain[];
  } | null;
  reasons: string[];
  alerted: boolean;
  triggeredBy: 'cron' | 'manual';
}

export default function BacklinkChangesTab() {
  const list = useServerFn(listBacklinkSnapshots);
  const runNow = useServerFn(runBacklinkWatcherNow);
  const [latest, setLatest] = useState<Snapshot | null>(null);
  const [history, setHistory] = useState<HistoryRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) throw new Error('Sign in as admin to load snapshots.');
      const res = await list({ data: { idToken, limit: 20 } });
      setLatest((res?.latest as any) ?? null);
      setHistory(((res?.history as any) ?? []) as HistoryRun[]);
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }, [list]);

  useEffect(() => { load(); }, [load]);

  const handleRun = async () => {
    setRunning(true);
    setErr(null);
    setMsg(null);
    try {
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) throw new Error('Sign in as admin to run watcher.');
      const res = await runNow({ data: { idToken } });
      const reasonStr = res.alerted.reasons.length ? res.alerted.reasons.join('; ') : 'no changes worth alerting';
      setMsg(`Run complete (${res.triggeredBy}, ${res.snapshot.refdomains.length} refdomains) — ${reasonStr}.`);
      await load();
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally {
      setRunning(false);
    }
  };

  const latestDiff = history[0]?.diff ?? null;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6 text-slate-100">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Backlink Changes</h1>
          <p className="text-slate-400 text-sm mt-1 max-w-2xl">
            Weekly Semrush snapshot of <code>phlabs.co.uk</code> referring domains. Alerts fire on new spam-pattern domains, ≥2pt AS drops, or ≥5 domain churn.
          </p>
        </div>
        <button
          onClick={handleRun}
          disabled={running}
          className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-medium flex items-center gap-2"
          aria-label="Run backlink watcher now"
        >
          {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Run now
        </button>
      </header>

      {err && (
        <div role="alert" className="p-3 rounded-lg bg-red-900/40 border border-red-700 text-red-100 text-sm">
          {err}
        </div>
      )}
      {msg && (
        <div role="status" className="p-3 rounded-lg bg-emerald-900/40 border border-emerald-700 text-emerald-100 text-sm">
          {msg}
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading snapshots…
        </div>
      ) : !latest ? (
        <div className="p-6 rounded-lg bg-slate-900 border border-slate-700 text-slate-300">
          No snapshots yet. Click <strong>Run now</strong> to capture the first baseline.
        </div>
      ) : (
        <>
          {/* KPI cards */}
          <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KpiCard label="Authority Score" value={latest.ascore ?? '-'} delta={latestDiff?.ascoreDelta ?? null} />
            <KpiCard label="Referring domains" value={latest.domains_num ?? '-'} delta={latestDiff?.domainsDelta ?? null} />
            <KpiCard label="Total backlinks" value={latest.total ?? '-'} delta={null} />
            <KpiCard
              label="Follow ratio"
              value={latest.follows_num != null && latest.total ? `${Math.round((latest.follows_num / latest.total) * 100)}%` : '-'}
              delta={null}
            />
          </section>

          {/* Spam alerts */}
          {latestDiff?.spamNewDomains?.length ? (
            <section className="p-4 rounded-lg bg-red-950/50 border border-red-700">
              <h2 className="font-semibold flex items-center gap-2 text-red-200">
                <AlertTriangle className="h-4 w-4" /> {latestDiff.spamNewDomains.length} new domain(s) match spam patterns
              </h2>
              <p className="text-sm text-red-300/80 mt-1">Review and add confirmed spam to <code>public/disavow.txt</code>.</p>
              <DomainTable rows={latestDiff.spamNewDomains} flavor="danger" />
            </section>
          ) : null}

          {/* New / lost since last run */}
          <div className="grid md:grid-cols-2 gap-4">
            <DiffPanel title="New since last run" rows={latestDiff?.newDomains ?? []} flavor="success" />
            <DiffPanel title="Lost since last run" rows={latestDiff?.lostDomains ?? []} flavor="muted" />
          </div>

          {/* Full latest refdomains */}
          <section>
            <h2 className="text-lg font-semibold mb-2">Current referring domains ({latest.refdomains.length})</h2>
            <DomainTable rows={latest.refdomains.slice(0, 100)} flavor="neutral" />
            {latest.refdomains.length > 100 && (
              <p className="text-xs text-slate-500 mt-2">Showing top 100 of {latest.refdomains.length}.</p>
            )}
          </section>

          {/* Run history */}
          <section>
            <h2 className="text-lg font-semibold mb-2">Run history</h2>
            <div className="overflow-x-auto rounded-lg border border-slate-700">
              <table className="w-full text-sm">
                <thead className="bg-slate-800 text-slate-300">
                  <tr>
                    <th className="text-left px-3 py-2">When</th>
                    <th className="text-left px-3 py-2">Trigger</th>
                    <th className="text-right px-3 py-2">AS</th>
                    <th className="text-right px-3 py-2">RefDomains</th>
                    <th className="text-right px-3 py-2">New</th>
                    <th className="text-right px-3 py-2">Lost</th>
                    <th className="text-left px-3 py-2">Reasons</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((r) => (
                    <tr key={r.id} className="border-t border-slate-800 hover:bg-slate-900/50">
                      <td className="px-3 py-2 text-slate-300 font-mono text-xs">{r.fetchedAt.replace('T', ' ').slice(0, 19)}</td>
                      <td className="px-3 py-2 text-slate-400 text-xs">{r.triggeredBy}</td>
                      <td className="px-3 py-2 text-right">{r.ascore ?? '-'}</td>
                      <td className="px-3 py-2 text-right">{r.domains_num ?? '-'}</td>
                      <td className="px-3 py-2 text-right text-emerald-300">{r.diff?.newDomains.length ?? '-'}</td>
                      <td className="px-3 py-2 text-right text-rose-300">{r.diff?.lostDomains.length ?? '-'}</td>
                      <td className="px-3 py-2 text-xs">
                        {r.alerted && r.reasons.length ? (
                          <span className="text-amber-300">{r.reasons.join('; ')}</span>
                        ) : (
                          <span className="text-slate-500">no alert</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="text-xs text-slate-500 pt-4 border-t border-slate-800">
            <p className="font-semibold text-slate-400 mb-1">Cron schedule (run once in Supabase SQL editor):</p>
            <pre className="bg-slate-900 p-3 rounded overflow-x-auto text-[11px]">{`SELECT cron.schedule('backlink-watcher-weekly', '0 7 * * 1', $$
  SELECT net.http_post(
    url := 'https://phlabs.co.uk/api/public/hooks/backlink-watcher',
    headers := '{"x-watchdog-secret":"<CLEANUP_SECRET>","Content-Type":"application/json"}'::jsonb,
    body := '{}'::jsonb
  );
$$);`}</pre>
          </section>
        </>
      )}
    </div>
  );
}

function KpiCard({ label, value, delta }: { label: string; value: string | number; delta: number | null }) {
  return (
    <div className="p-4 rounded-lg bg-slate-900 border border-slate-700">
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className="text-2xl font-bold mt-1">{value}</div>
      {delta != null && delta !== 0 && (
        <div className={`text-xs mt-1 flex items-center gap-1 ${delta > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
          {delta > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
          {delta > 0 ? '+' : ''}{delta} since last run
        </div>
      )}
    </div>
  );
}

function DiffPanel({ title, rows, flavor }: { title: string; rows: RefDomain[]; flavor: 'success' | 'muted' }) {
  return (
    <div className={`p-4 rounded-lg border ${flavor === 'success' ? 'border-emerald-700/50 bg-emerald-950/20' : 'border-slate-700 bg-slate-900/50'}`}>
      <h3 className="font-semibold mb-2">{title} ({rows.length})</h3>
      {rows.length === 0 ? (
        <p className="text-sm text-slate-500">No changes.</p>
      ) : (
        <DomainTable rows={rows.slice(0, 25)} flavor="neutral" />
      )}
    </div>
  );
}

function DomainTable({ rows, flavor }: { rows: RefDomain[]; flavor: 'neutral' | 'danger' }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-700 mt-2">
      <table className="w-full text-sm">
        <thead className={`${flavor === 'danger' ? 'bg-red-900/40' : 'bg-slate-800'} text-slate-300`}>
          <tr>
            <th className="text-left px-3 py-2">Domain</th>
            <th className="text-right px-3 py-2">AS</th>
            <th className="text-right px-3 py-2">Links</th>
            <th className="text-left px-3 py-2">CC</th>
            <th className="text-left px-3 py-2">First seen</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.domain} className="border-t border-slate-800">
              <td className="px-3 py-2">
                <a
                  href={`https://${r.domain}`}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="text-emerald-300 hover:underline inline-flex items-center gap-1"
                >
                  {r.domain} <ExternalLink className="h-3 w-3" />
                </a>
              </td>
              <td className="px-3 py-2 text-right">{r.ascore ?? '-'}</td>
              <td className="px-3 py-2 text-right">{r.backlinks_num ?? '-'}</td>
              <td className="px-3 py-2 text-slate-400">{r.country ?? '-'}</td>
              <td className="px-3 py-2 text-slate-500 text-xs">{r.first_seen ?? '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
