/**
 * Audit history for compound-negative applications to Google Ads.
 *
 * Reads server-side from compound_negatives_applied (admin-only). Each row
 * captures: when the push ran, dry-run vs live, target campaign ID,
 * operation count, the exact negative keywords sent, and (for live runs)
 * the HTTP status + Google Ads API response snippet.
 */
import { useEffect, useMemo, useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { auth } from '@/lib/firebase';
import { listCompoundNegativesAudit } from '@/lib/compound-queries.functions';
import { redactSensitiveValue } from '@/lib/redact-sensitive';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';


type RetryAttempt = { attempt: number; delayMs: number; error?: string };
type AuditRow = {
  id?: string;
  mode?: 'dry-run' | 'live';
  negatives?: string[];
  operationCount?: number;
  campaignResourceId?: string | null;
  dryRun?: boolean;
  httpStatus?: number;
  responseSnippet?: string;
  previewJson?: string;
  correlationId?: string;
  retryAttempts?: RetryAttempt[];
  createdAt?: string | { _seconds?: number; seconds?: number };
  thresholds?: { minImpressions?: number; growthRatio?: number; windowDays?: number };
};


function fmtTs(v: AuditRow['createdAt']): string {
  if (!v) return '—';
  if (typeof v === 'string') return new Date(v).toLocaleString('en-GB');
  const s = v._seconds ?? v.seconds;
  if (typeof s === 'number') return new Date(s * 1000).toLocaleString('en-GB');
  return '—';
}

export default function CompoundNegativesAuditTab() {
  const listFn = useServerFn(listCompoundNegativesAudit);
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<'all' | 'dry-run' | 'live'>('all');
  const [cidQuery, setCidQuery] = useState('');
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [swResetOpen, setSwResetOpen] = useState(false);
  const [swResetBusy, setSwResetBusy] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const user = auth.currentUser;
      if (!user) throw new Error('Not signed in');
      const idToken = await user.getIdToken();
      const r = (await listFn({ data: { idToken, limit: 200 } })) as { rowsJson: string };
      setRows(JSON.parse(r.rowsJson) as AuditRow[]);
    } catch (e) {
      toast.error(`Audit load failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Filter pipeline:
   *  1. Apply mode (all | dry-run | live)
   *  2. Apply correlationId search (case-insensitive, substring)
   *  3. When a CID search is active, sort chronologically ASC so the
   *     dry-run → live sequence reads top-to-bottom.
   */
  const filtered = useMemo(() => {
    let out = filter === 'all' ? rows : rows.filter((r) => r.mode === filter);
    const q = cidQuery.trim().toLowerCase();
    if (q) {
      out = out.filter((r) => (r.correlationId ?? '').toLowerCase().includes(q));
      const tsOf = (v: AuditRow['createdAt']): number => {
        if (!v) return 0;
        if (typeof v === 'string') return new Date(v).getTime();
        const s = v._seconds ?? v.seconds;
        return typeof s === 'number' ? s * 1000 : 0;
      };
      out = [...out].sort((a, b) => tsOf(a.createdAt) - tsOf(b.createdAt));
    }
    return out;
  }, [rows, filter, cidQuery]);

  function toggle(i: number) {
    setExpanded((p) => {
      const n = new Set(p);
      if (n.has(i)) n.delete(i);
      else n.add(i);
      return n;
    });
  }


  /**
   * CSV export.
   *  - "summary" mode: one row per audit entry (legacy shape, plus retry count).
   *  - "attempts" mode: one row per retry attempt under the same correlationId,
   *    so you can see attempt index → delay → final success/failure for each
   *    operation grouped by correlationId.
   */
  function exportCsv(mode: 'summary' | 'attempts' = 'summary') {
    const esc = (c: string) => (/[,"\r\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c);

    if (mode === 'attempts') {
      const header =
        'CorrelationId,Timestamp,Mode,CampaignResourceId,OperationCount,AttemptIndex,AttemptCount,DelayMs,AttemptError,FinalHttpStatus,FinalOutcome\r\n';
      const lines: string[] = [];
      for (const r of filtered) {
        const attempts =
          r.retryAttempts && r.retryAttempts.length > 0
            ? r.retryAttempts
            : [{ attempt: 1, delayMs: 0, error: undefined as string | undefined }];
        const total = attempts.length;
        const lastErr = attempts[attempts.length - 1]?.error;
        const httpOk =
          typeof r.httpStatus === 'number' && r.httpStatus > 0 && r.httpStatus < 400;
        const finalOutcome = r.mode === 'dry-run'
          ? 'dry-run'
          : httpOk && !lastErr
          ? 'success'
          : 'failure';
        for (const a of attempts) {
          lines.push(
            [
              r.correlationId ?? '',
              fmtTs(r.createdAt),
              r.mode ?? '',
              r.campaignResourceId ?? '',
              String(r.operationCount ?? r.negatives?.length ?? 0),
              String(a.attempt),
              String(total),
              String(a.delayMs ?? 0),
              a.error ?? '',
              String(r.httpStatus ?? ''),
              finalOutcome,
            ]
              .map(esc)
              .join(','),
          );
        }
      }
      download(header + lines.join('\r\n') + '\r\n', `compound-negatives-attempts-${new Date().toISOString().slice(0, 10)}.csv`);
      return;
    }

    const header =
      'Timestamp,CorrelationId,Mode,CampaignResourceId,OperationCount,RetryCount,FinalOutcome,HttpStatus,MinImpressions,GrowthRatio,WindowDays,Negatives\r\n';
    const body = filtered
      .map((r) => {
        const httpOk =
          typeof r.httpStatus === 'number' && r.httpStatus > 0 && r.httpStatus < 400;
        const lastErr = r.retryAttempts?.[r.retryAttempts.length - 1]?.error;
        const finalOutcome = r.mode === 'dry-run'
          ? 'dry-run'
          : httpOk && !lastErr
          ? 'success'
          : 'failure';
        return [
          fmtTs(r.createdAt),
          r.correlationId ?? '',
          r.mode ?? '',
          r.campaignResourceId ?? '',
          String(r.operationCount ?? r.negatives?.length ?? 0),
          String(r.retryAttempts?.length ?? 0),
          finalOutcome,
          String(r.httpStatus ?? ''),
          String(r.thresholds?.minImpressions ?? ''),
          String(r.thresholds?.growthRatio ?? ''),
          String(r.thresholds?.windowDays ?? ''),
          (r.negatives ?? []).join(' | '),
        ]
          .map(esc)
          .join(',');
      })
      .join('\r\n');
    download(header + body + '\r\n', `compound-negatives-audit-${new Date().toISOString().slice(0, 10)}.csv`);
  }

  function download(text: string, name: string, mime = 'text/csv;charset=utf-8') {
    const blob = new Blob([text], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  /**
   * Bulk-download the redacted dry-run / response payloads for whatever
   * the user is currently filtering on (mode + correlationId search).
   * Output is one JSON file containing an array of entries with credentials
   * scrubbed via `redactSensitiveValue`; `correlationId` is preserved.
   */
  function downloadRedactedJsonBundle() {
    if (filtered.length === 0) return;
    const payload = filtered.map((r) => ({
      correlationId: r.correlationId ?? null,
      createdAt: fmtTs(r.createdAt),
      mode: r.mode ?? null,
      campaignResourceId: r.campaignResourceId ?? null,
      operationCount: r.operationCount ?? r.negatives?.length ?? 0,
      httpStatus: r.httpStatus ?? null,
      thresholds: r.thresholds ?? null,
      retryAttempts: r.retryAttempts ?? [],
      previewJson: r.previewJson ? safeParse(r.previewJson) : null,
      responseSnippet: r.responseSnippet ?? null,
    }));
    const wrapped = {
      _note: 'Sensitive fields redacted. correlationId preserved for tracing.',
      exportedAt: new Date().toISOString(),
      filter: { mode: filter, correlationIdQuery: cidQuery || null },
      count: filtered.length,
      entries: payload,
    };
    const redacted = redactSensitiveValue(wrapped);
    const tag = cidQuery ? cidQuery.replace(/[^a-z0-9-]/gi, '_') : 'filtered';
    download(redacted, `compound-negatives-${tag}.redacted.json`, 'application/json');
    toast.success(`Downloaded ${filtered.length} redacted entries`);
  }

  function safeParse(s: string): unknown {
    try { return JSON.parse(s); } catch { return s; }
  }

  /**
   * Unregister any active Service Worker(s), clear all CacheStorage buckets
   * scoped to this origin, then hard-reload the admin page. Used when a stale
   * SW is serving an old admin bundle that 404s on refresh.
   */
  async function performSwReset() {
    setSwResetBusy(true);
    let unregistered = 0;
    let cachesCleared = 0;
    try {
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        const results = await Promise.all(regs.map((r) => r.unregister()));
        unregistered = results.filter(Boolean).length;
      }
      if ('caches' in window) {
        const keys = await caches.keys();
        const results = await Promise.all(keys.map((k) => caches.delete(k)));
        cachesCleared = results.filter(Boolean).length;
      }
      toast.success(
        `Cleared ${unregistered} service worker${unregistered === 1 ? '' : 's'} and ${cachesCleared} cache bucket${cachesCleared === 1 ? '' : 's'} — hard-reloading…`,
      );
      setSwResetOpen(false);
      setTimeout(() => window.location.replace('/admin?sw=off'), 500);
    } catch (e) {
      toast.error(`SW reset failed: ${e instanceof Error ? e.message : String(e)}`);
      setSwResetBusy(false);
    }
  }



  const counts = useMemo(
    () => ({
      total: rows.length,
      dryRun: rows.filter((r) => r.mode === 'dry-run').length,
      live: rows.filter((r) => r.mode === 'live').length,
      liveFail: rows.filter(
        (r) => r.mode === 'live' && typeof r.httpStatus === 'number' && r.httpStatus >= 400,
      ).length,
    }),
    [rows],
  );

  return (
    <div className="p-4 md:p-6 max-w-7xl">
      <header className="mb-6">
        <h2 className="text-2xl font-bold text-white">Compound Negatives — Audit History</h2>
        <p className="text-slate-400 text-sm mt-1">
          Every push from <code className="text-emerald-400">/compound Queries → Apply</code>{' '}
          is recorded here (dry-run and live). Server-only writes; admin-only reads.
        </p>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4 text-sm">
        <Stat label="Total entries" value={counts.total} />
        <Stat label="Dry-runs" value={counts.dryRun} />
        <Stat label="Live pushes" value={counts.live} tone={counts.live > 0 ? 'warn' : 'neutral'} />
        <Stat
          label="Live failures"
          value={counts.liveFail}
          tone={counts.liveFail > 0 ? 'danger' : 'ok'}
        />
      </div>

      <div className="flex flex-wrap gap-2 mb-4 items-center">
        {(['all', 'dry-run', 'live'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-2 rounded-lg text-xs font-semibold ${
              filter === f ? 'bg-emerald-600 text-white' : 'bg-slate-700 text-slate-200'
            }`}
          >
            {f === 'all' ? 'All' : f === 'dry-run' ? 'Dry-runs' : 'Live'}
          </button>
        ))}
        <button
          onClick={load}
          disabled={loading}
          className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-semibold"
        >
          {loading ? '⏳ Loading…' : '↻ Refresh'}
        </button>
        <input
          type="search"
          value={cidQuery}
          onChange={(e) => setCidQuery(e.target.value)}
          placeholder="🔎 Filter by correlationId (e.g. cmp- / ui- / cron-)"
          className="flex-1 min-w-[260px] border-2 border-slate-600 bg-slate-800 text-white rounded-lg px-3 py-2 text-xs font-mono placeholder:text-slate-500"
          aria-label="Filter by correlation ID"
        />
        {cidQuery && (
          <button
            onClick={() => setCidQuery('')}
            className="bg-slate-700 hover:bg-slate-600 text-slate-200 px-3 py-2 rounded-lg text-xs"
          >
            ✕ Clear
          </button>
        )}
        <button
          onClick={() => exportCsv('summary')}
          disabled={filtered.length === 0}
          className="bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-white px-3 py-2 rounded-lg text-xs"
          title="One row per audit entry"
        >
          ⬇ CSV (summary)
        </button>
        <button
          onClick={() => exportCsv('attempts')}
          disabled={filtered.length === 0}
          className="bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-white px-3 py-2 rounded-lg text-xs"
          title="One row per retry attempt, grouped by correlationId"
        >
          ⬇ CSV (attempts)
        </button>
        <button
          onClick={downloadRedactedJsonBundle}
          disabled={filtered.length === 0}
          className="bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-white px-3 py-2 rounded-lg text-xs font-semibold"
          title="Download redacted JSON for the currently filtered correlationId results"
        >
          ⬇ JSON (redacted, filtered)
        </button>
        <button
          onClick={() => setSwResetOpen(true)}
          className="bg-amber-700 hover:bg-amber-600 text-white px-3 py-2 rounded-lg text-xs font-semibold"
          title="Unregister Service Worker, clear caches, hard-reload /admin"
        >
          ♻ Reset SW & Reload
        </button>
      </div>

      <AlertDialog open={swResetOpen} onOpenChange={(o) => !swResetBusy && setSwResetOpen(o)}>
        <AlertDialogContent className="bg-slate-900 border-2 border-slate-700 text-white">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">
              Reset Service Worker & hard-reload?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-slate-300 space-y-2">
              <span className="block">This will, for this browser only:</span>
              <ul className="list-disc pl-5 text-slate-200 text-sm space-y-1">
                <li>Unregister every active service worker on this origin.</li>
                <li>Delete every CacheStorage bucket (offline cache, asset cache).</li>
                <li>Hard-reload to <code className="text-emerald-300">/admin?sw=off</code>.</li>
              </ul>
              <span className="block text-amber-300 text-xs">
                Your sign-in, Firestore data, and admin settings are NOT affected. You may
                see a brief blank page while the new app shell downloads.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              disabled={swResetBusy}
              className="bg-slate-700 text-white hover:bg-slate-600 border-slate-600"
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={swResetBusy}
              onClick={(e) => {
                e.preventDefault();
                void performSwReset();
              }}
              className="bg-amber-600 hover:bg-amber-500 text-white"
            >
              {swResetBusy ? 'Clearing…' : 'Clear & Reload'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {cidQuery && (
        <p className="text-[11px] text-cyan-300 mb-3 font-mono">
          Showing {filtered.length} attempt(s) for correlationId containing{' '}
          <span className="bg-slate-800 px-1 rounded">{cidQuery}</span> · sorted oldest → newest
        </p>
      )}

      <div className="overflow-auto rounded-xl border-2 border-slate-700 bg-slate-900">
        <table className="w-full text-sm">
          <thead className="bg-slate-800 text-slate-300">
            <tr>
              <th className="text-left px-3 py-2">When</th>
              <th className="text-left px-3 py-2">Mode</th>
              <th className="text-left px-3 py-2">Correlation ID</th>
              <th className="text-left px-3 py-2">Campaign ID</th>
              <th className="text-right px-3 py-2">Ops</th>
              <th className="text-right px-3 py-2">Retries</th>
              <th className="text-left px-3 py-2">Thresholds</th>
              <th className="text-right px-3 py-2">HTTP</th>
              <th />
            </tr>
          </thead>

          <tbody>
            {filtered.map((r, i) => {
              const isOpen = expanded.has(i);
              const live = r.mode === 'live';
              const failed = live && typeof r.httpStatus === 'number' && r.httpStatus >= 400;
              return (
                <>
                  <tr
                    key={`row-${i}`}
                    className={`border-t border-slate-800 ${
                      failed ? 'bg-red-950/40' : live ? 'bg-amber-950/30' : ''
                    }`}
                  >
                    <td className="px-3 py-2 text-slate-200 font-mono text-xs">
                      {fmtTs(r.createdAt)}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`px-1.5 py-0.5 rounded text-xs font-semibold ${
                          live
                            ? 'bg-red-700 text-red-50'
                            : 'bg-slate-700 text-slate-100'
                        }`}
                      >
                        {r.mode ?? '—'}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-cyan-300 font-mono text-[11px]">
                      {r.correlationId ? (
                        <button
                          onClick={() => navigator.clipboard?.writeText(r.correlationId!)}
                          title="Click to copy"
                          className="hover:text-cyan-200"
                        >
                          {r.correlationId}
                        </button>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-3 py-2 text-emerald-300 font-mono text-xs">
                      {r.campaignResourceId || '—'}
                    </td>
                    <td className="px-3 py-2 text-right text-slate-200">
                      {r.operationCount ?? r.negatives?.length ?? 0}
                    </td>
                    <td
                      className={`px-3 py-2 text-right font-mono text-xs ${
                        (r.retryAttempts?.length ?? 0) > 1 ? 'text-amber-300' : 'text-slate-500'
                      }`}
                      title={
                        r.retryAttempts
                          ?.map((a) => `#${a.attempt} +${a.delayMs}ms${a.error ? ` — ${a.error}` : ''}`)
                          .join('\n') || ''
                      }
                    >
                      {r.retryAttempts?.length ?? 0}
                    </td>
                    <td className="px-3 py-2 text-slate-400 text-xs font-mono">
                      {r.thresholds
                        ? `imp≥${r.thresholds.minImpressions} · Δ${r.thresholds.growthRatio} · ${r.thresholds.windowDays}d`
                        : '—'}
                    </td>
                    <td
                      className={`px-3 py-2 text-right font-mono text-xs ${
                        failed
                          ? 'text-red-300'
                          : live
                          ? 'text-emerald-300'
                          : 'text-slate-500'
                      }`}
                    >
                      {r.httpStatus ?? '—'}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        onClick={() => toggle(i)}
                        className="text-xs text-blue-300 hover:text-blue-200"
                      >
                        {isOpen ? '▲ Hide' : '▼ Details'}
                      </button>
                    </td>

                  </tr>
                  {isOpen && (
                    <tr key={`detail-${i}`} className="bg-slate-950 border-t border-slate-800">
                      <td colSpan={9} className="px-3 py-3">
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                          <div>
                            <h4 className="text-xs font-semibold text-slate-300 mb-1">
                              Negatives ({r.negatives?.length ?? 0})
                            </h4>
                            <div className="max-h-48 overflow-auto rounded bg-slate-900 border border-slate-800 p-2">
                              {(r.negatives ?? []).length === 0 ? (
                                <span className="text-slate-500 text-xs italic">None</span>
                              ) : (
                                <ul className="flex flex-wrap gap-1">
                                  {(r.negatives ?? []).map((n) => (
                                    <li
                                      key={n}
                                      className="px-1.5 py-0.5 rounded bg-red-900 text-red-100 text-xs font-mono"
                                    >
                                      {n}
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </div>
                          </div>
                          {(r.retryAttempts?.length ?? 0) > 0 && (
                            <div>
                              <h4 className="text-xs font-semibold text-slate-300 mb-1">
                                Retry timeline ({r.retryAttempts!.length})
                              </h4>
                              <ol className="rounded bg-slate-900 border border-slate-800 p-2 text-[11px] font-mono text-slate-200 space-y-0.5">
                                {r.retryAttempts!.map((a, idx) => (
                                  <li
                                    key={idx}
                                    className={a.error ? 'text-amber-300' : 'text-emerald-300'}
                                  >
                                    #{a.attempt} · delay {a.delayMs}ms
                                    {a.error ? ` · ${a.error}` : ' · ok'}
                                  </li>
                                ))}
                              </ol>
                            </div>
                          )}
                          {r.previewJson && (
                            <div className="lg:col-span-2">
                              <h4 className="text-xs font-semibold text-slate-300 mb-1">
                                Dry-run operations preview
                              </h4>
                              <pre className="max-h-48 overflow-auto rounded bg-slate-900 border border-slate-800 p-2 text-[11px] text-cyan-200 whitespace-pre-wrap font-mono">
                                {r.previewJson}
                              </pre>
                            </div>
                          )}
                          {r.responseSnippet && (
                            <div className="lg:col-span-2">
                              <h4 className="text-xs font-semibold text-slate-300 mb-1">
                                Google Ads API response
                              </h4>
                              <pre className="max-h-48 overflow-auto rounded bg-slate-900 border border-slate-800 p-2 text-[11px] text-emerald-200 whitespace-pre-wrap font-mono">
                                {r.responseSnippet}
                              </pre>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={9} className="px-3 py-6 text-center text-slate-400">
                  No audit entries for this filter.
                </td>
              </tr>
            )}

          </tbody>
        </table>
      </div>
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
