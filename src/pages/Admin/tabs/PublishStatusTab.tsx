import { useEffect, useState } from 'react';

/**
 * Publish Status admin tab — pulls /api/public/publish-status (safe, non-sensitive
 * build-state diagnostics). Auto-refreshes every 30s.
 *
 * Alerts on:
 *  - buildMatch === false (post-publish-check hasn't fired for current deploy)
 *  - lastPurgeOk === false (Cloudflare purge failed on last run)
 *  - recentAuditFailures > 0 (audit log writes failed and fell back to errorLogs)
 */

interface PublishStatus {
  currentBuildId: string;
  lastBuildId: string | null;
  buildMatch: boolean;
  buildState: {
    lastBuildId: string | null;
    previousBuildId: string | null;
    updatedAt: string | null;
  };
  lastCheckTime: number | null;
  lastCheckSuccess: boolean;
  lastCheckBuildId: string | null;
  lastPurgeRequested: boolean;
  lastPurgeOk: boolean;
  lastPurgeStatus: number | null;
  lastRecacheRequested: boolean;
  lastRecacheOk: boolean;
  lastRecacheUrls: number | null;
  recentAuditFailures: number;
  recentAuditFailureSample: Array<{ id: string; error: string | null; createdAt: unknown }>;
  checkedAt: string;
}

interface PostPublishStatus {
  entries: Array<{
    id: string;
    kind: string | null;
    message: string | null;
    buildId: string | null;
    ok: boolean | null;
    status: number | null;
    createdAt: unknown;
  }>;
}

function StatusCard({
  title,
  value,
  ok,
  hint,
}: {
  title: string;
  value: string;
  ok?: boolean | null;
  hint?: string;
}) {
  const cls =
    ok === false
      ? 'border-red-500/60 bg-red-500/10'
      : ok === true
      ? 'border-emerald-500/60 bg-emerald-500/10'
      : 'border-slate-700 bg-slate-800/60';
  return (
    <div className={`p-4 rounded-lg border-2 ${cls}`}>
      <div className="text-xs uppercase tracking-wide text-slate-400">{title}</div>
      <div className="text-base font-mono text-white mt-1 break-all">{value}</div>
      {hint && <div className="text-xs text-slate-400 mt-1">{hint}</div>}
      {ok === false && <div className="text-red-400 text-xs mt-2">⚠ Issue detected</div>}
      {ok === true && <div className="text-emerald-400 text-xs mt-2">✓ OK</div>}
    </div>
  );
}

export default function PublishStatusTab() {
  const [status, setStatus] = useState<PublishStatus | null>(null);
  const [postPublish, setPostPublish] = useState<PostPublishStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const [res, detailRes] = await Promise.all([
          fetch('/api/public/publish-status', { cache: 'no-store' }),
          fetch('/api/public/post-publish-status', { cache: 'no-store' }),
        ]);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as PublishStatus;
        const details = detailRes.ok ? ((await detailRes.json()) as PostPublishStatus) : null;
        if (!cancelled) {
          setStatus(data);
          setPostPublish(details);
          setError(null);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
          setLoading(false);
        }
      }
    };
    load();
    const id = setInterval(load, 30_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  if (loading) return <div className="p-6 text-slate-300">Loading publish status…</div>;
  if (error) return <div className="p-6 text-red-400">Failed to load: {error}</div>;
  if (!status) return null;

  const fmt = (t: number | null) => (t ? new Date(t).toLocaleString() : 'never');

  return (
    <div className="p-6 max-w-5xl">
      <h1 className="text-2xl font-bold text-white mb-2">Publish Status</h1>
      <p className="text-sm text-slate-400 mb-6">
        Auto-refreshes every 30s. Last check: {status.checkedAt}
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <StatusCard
          title="Current Build (running)"
          value={status.currentBuildId}
          ok={status.buildMatch}
        />
        <StatusCard
          title="Last Published Build (Firestore)"
          value={status.lastBuildId ?? 'never'}
          ok={status.buildMatch}
          hint={
            status.buildState.updatedAt
              ? `updated ${new Date(status.buildState.updatedAt).toLocaleString()}`
              : undefined
          }
        />
        <StatusCard
          title="Last post-publish-check"
          value={fmt(status.lastCheckTime)}
          ok={status.lastCheckSuccess}
          hint={status.lastCheckBuildId ? `build ${status.lastCheckBuildId}` : undefined}
        />
        <StatusCard
          title="Cloudflare Purge"
          value={
            status.lastPurgeRequested
              ? `${status.lastPurgeOk ? 'ok' : 'failed'} (${status.lastPurgeStatus ?? '?'})`
              : 'not requested'
          }
          ok={status.lastPurgeRequested ? status.lastPurgeOk : null}
        />
        <StatusCard
          title="Prerender Recache"
          value={
            status.lastRecacheRequested
              ? `${status.lastRecacheOk ? 'ok' : 'failed'} · ${status.lastRecacheUrls ?? 0} URLs`
              : 'not requested'
          }
          ok={status.lastRecacheRequested ? status.lastRecacheOk : null}
        />
        <StatusCard
          title="Recent auditLogs failures"
          value={String(status.recentAuditFailures)}
          ok={status.recentAuditFailures === 0}
          hint="from errorLogs (audit_log_failure)"
        />
      </div>

      {status.recentAuditFailureSample.length > 0 && (
        <div className="mt-6 p-4 rounded-lg border-2 border-red-500/60 bg-red-500/5">
          <h2 className="font-semibold text-red-300 mb-2">Recent audit-log failures</h2>
          <ul className="text-xs font-mono text-slate-300 space-y-1">
            {status.recentAuditFailureSample.map((r) => (
              <li key={r.id}>
                <span className="text-slate-500">{r.id}:</span> {r.error ?? 'unknown'}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-6 p-4 rounded-lg border-2 border-slate-700 bg-slate-900">
        <h2 className="font-semibold text-white mb-2">Raw build_state</h2>
        <pre className="text-xs overflow-auto text-slate-300">
          {JSON.stringify(status.buildState, null, 2)}
        </pre>
      </div>

      {postPublish && (
        <div className="mt-6 p-4 rounded-lg border-2 border-slate-700 bg-slate-900">
          <h2 className="font-semibold text-white mb-2">Post-publish audit trail</h2>
          <div className="space-y-2 text-xs font-mono text-slate-300">
            {postPublish.entries.length === 0 && <div className="text-slate-500">No post-publish entries yet.</div>}
            {postPublish.entries.map((entry) => (
              <div key={entry.id} className="border border-slate-800 rounded-lg p-2 bg-slate-950/60">
                <div className="text-slate-500">{String(entry.createdAt ?? '')}</div>
                <div className="text-white break-all">{entry.message ?? entry.kind ?? 'post-publish event'}</div>
                <div className="text-slate-400 break-all">build {entry.buildId ?? 'unknown'} · {entry.status ?? ''} {entry.ok === null ? '' : entry.ok ? 'ok' : 'failed'}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-4 text-xs text-slate-500">
        Diagnostic endpoints:{' '}
        <code className="text-slate-300">/api/public/diag/build-state</code>,{' '}
        <code className="text-slate-300">/api/public/diag/cache-headers?path=/</code>,{' '}
        <code className="text-slate-300">/api/public/publish-status</code>,{' '}
        <code className="text-slate-300">/api/public/post-publish-status</code>
      </div>
    </div>
  );
}
