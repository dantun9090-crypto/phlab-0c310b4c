import { useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { Loader2, RefreshCw, Download, CheckCircle2, XCircle, AlertTriangle, ExternalLink, FileSpreadsheet } from 'lucide-react';
import { getAdminIdToken } from '@/lib/auth-ready';
import { runMarketingCoverageReport, type CoverageReport, type CoverageRow } from '@/lib/marketing-coverage.functions';

function verdictColor(v: string): string {
  if (v === 'PASS') return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30';
  if (v === 'NEUTRAL') return 'bg-slate-700/40 text-slate-300 border-slate-600';
  if (v === 'PARTIAL') return 'bg-amber-500/15 text-amber-300 border-amber-500/30';
  if (v === 'ERROR') return 'bg-rose-500/15 text-rose-300 border-rose-500/30';
  return 'bg-red-500/15 text-red-300 border-red-500/30';
}

function tierColor(t: CoverageRow['tier']): string {
  if (t === 'critical') return 'bg-rose-500/15 text-rose-300';
  if (t === 'high') return 'bg-amber-500/15 text-amber-300';
  return 'bg-slate-700/40 text-slate-300';
}

function toCsv(report: CoverageReport): string {
  const headers = [
    'path', 'label', 'tier', 'inSitemap',
    'httpStatus', 'httpBytes', 'httpVia', 'httpError',
    'gscVerdict', 'gscCoverage', 'gscIndexing', 'gscLastCrawl',
    'googleCanonical', 'userCanonical', 'gscError',
  ];
  const lines = [headers.join(',')];
  for (const r of report.rows) {
    const cells = [
      r.path, r.label, r.tier, r.inSitemap,
      r.http.status, r.http.bytes, r.http.via ?? '', r.http.error ?? '',
      r.gsc.verdict, r.gsc.coverageState, r.gsc.indexingState, r.gsc.lastCrawlTime ?? '',
      r.gsc.googleCanonical ?? '', r.gsc.userCanonical ?? '', r.gsc.error ?? '',
    ].map((v) => {
      const s = String(v ?? '');
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    });
    lines.push(cells.join(','));
  }
  return lines.join('\n');
}

function download(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 4_000);
}

export default function MarketingCoverageTab() {
  const runFn = useServerFn(runMarketingCoverageReport);
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<CoverageReport | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const run = async () => {
    setLoading(true);
    setErr(null);
    try {
      const idToken = await getAdminIdToken();
      const r = await (runFn as any)({ data: { idToken } });
      setReport(r);
    } catch (e: any) {
      setErr(e?.message || 'Report failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold text-white">Marketing Coverage Report</h2>
          <p className="text-slate-400 text-sm mt-1">
            On-demand summary of sitemap coverage, GSC index status, and last crawl for every SEO-critical route.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={run}
            disabled={loading}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg font-medium flex items-center gap-2 min-h-[44px]"
            aria-label="Run marketing coverage report"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            {loading ? 'Running…' : 'Run report'}
          </button>
          {report && (
            <>
              <button
                onClick={() => download(`marketing-coverage-${report.generatedAt.slice(0, 10)}.csv`, toCsv(report), 'text/csv')}
                className="px-3 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-600 text-white rounded-lg text-sm flex items-center gap-2 min-h-[44px]"
              >
                <FileSpreadsheet className="w-4 h-4" /> CSV
              </button>
              <button
                onClick={() => download(`marketing-coverage-${report.generatedAt.slice(0, 10)}.json`, JSON.stringify(report, null, 2), 'application/json')}
                className="px-3 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-600 text-white rounded-lg text-sm flex items-center gap-2 min-h-[44px]"
              >
                <Download className="w-4 h-4" /> JSON
              </button>
            </>
          )}
        </div>
      </div>

      {err && (
        <div className="bg-rose-950/40 border border-rose-700/40 text-rose-200 rounded-lg p-3 text-sm">
          {err}
        </div>
      )}

      {report && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {[
              { label: 'Routes', value: report.summary.total },
              { label: 'Indexed (PASS)', value: report.summary.indexed, tone: 'emerald' },
              { label: 'Crawled ≤30d', value: report.summary.crawledLast30d, tone: 'emerald' },
              { label: 'Missing from sitemap', value: report.summary.missingFromSitemap, tone: report.summary.missingFromSitemap ? 'amber' : 'slate' },
              { label: 'Failed HTTP', value: report.summary.failedHttp, tone: report.summary.failedHttp ? 'rose' : 'slate' },
            ].map((s) => (
              <div key={s.label} className="bg-slate-900 border border-slate-700 rounded-lg p-3">
                <div className="text-xs text-slate-400">{s.label}</div>
                <div className={`text-2xl font-bold mt-1 text-${s.tone || 'white'}-300`}>{s.value}</div>
              </div>
            ))}
          </div>

          <div className="text-xs text-slate-500">
            Generated {new Date(report.generatedAt).toLocaleString('en-GB')} · sitemap entries: {report.sitemapEntries}
          </div>

          <div className="overflow-x-auto bg-slate-900 border border-slate-700 rounded-lg">
            <table className="w-full text-sm">
              <thead className="bg-slate-800 text-slate-300">
                <tr>
                  <th className="text-left p-3">Route</th>
                  <th className="text-left p-3">Tier</th>
                  <th className="text-left p-3">Sitemap</th>
                  <th className="text-left p-3">HTTP</th>
                  <th className="text-left p-3">GSC Verdict</th>
                  <th className="text-left p-3">Coverage</th>
                  <th className="text-left p-3">Last crawl</th>
                  <th className="text-left p-3">Canonical match</th>
                </tr>
              </thead>
              <tbody>
                {report.rows.map((r) => {
                  const canonicalMatch =
                    !r.gsc.googleCanonical || !r.gsc.userCanonical
                      ? null
                      : r.gsc.googleCanonical === r.gsc.userCanonical;
                  return (
                    <tr key={r.path} className="border-t border-slate-800">
                      <td className="p-3">
                        <a
                          href={`https://phlabs.co.uk${r.path}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-emerald-400 hover:underline flex items-center gap-1"
                        >
                          {r.path}
                          <ExternalLink className="w-3 h-3" />
                        </a>
                        <div className="text-xs text-slate-500">{r.label}</div>
                      </td>
                      <td className="p-3">
                        <span className={`px-2 py-0.5 rounded text-xs ${tierColor(r.tier)}`}>{r.tier}</span>
                      </td>
                      <td className="p-3">
                        {r.inSitemap ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        ) : (
                          <XCircle className="w-4 h-4 text-rose-400" />
                        )}
                      </td>
                      <td className="p-3">
                        <span className={r.http.ok ? 'text-emerald-300' : 'text-rose-300'}>
                          {r.http.status || 'ERR'}
                        </span>
                        <div className="text-xs text-slate-500">
                          {(r.http.bytes / 1024).toFixed(1)} KB · {r.http.via || '—'}
                        </div>
                      </td>
                      <td className="p-3">
                        <span className={`px-2 py-0.5 rounded border text-xs ${verdictColor(r.gsc.verdict)}`}>
                          {r.gsc.verdict}
                        </span>
                      </td>
                      <td className="p-3 text-xs text-slate-300">{r.gsc.coverageState || '—'}</td>
                      <td className="p-3 text-xs text-slate-400">
                        {r.gsc.lastCrawlTime ? new Date(r.gsc.lastCrawlTime).toLocaleDateString('en-GB') : '—'}
                      </td>
                      <td className="p-3">
                        {canonicalMatch === null ? (
                          <span className="text-slate-500 text-xs">—</span>
                        ) : canonicalMatch ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        ) : (
                          <AlertTriangle className="w-4 h-4 text-amber-400" />
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
