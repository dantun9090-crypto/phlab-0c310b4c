import { useEffect, useState } from 'react';
import { RefreshCw, Loader2 } from 'lucide-react';

/**
 * Comprehensive Audit Report — reads /api/public/audit-report.
 * Server runs all checks; response is cached 1h in the worker.
 * Click "Force rerun" to bypass the cache.
 */

interface CategoryReport {
  score: number;
  issues: string[];
  passed: string[];
}

interface AuditReport {
  checkedAt: string;
  overallScore: number;
  categories: Record<string, CategoryReport>;
  criticalIssues: string[];
  warnings: string[];
  recommendations: string[];
  sampledPages: Array<{ path: string; status: number; ms: number }>;
  cache?: { hit: boolean; ageMs: number };
}

const CATEGORY_LABELS: Record<string, string> = {
  meta: 'Meta & Head',
  headers: 'HTTP Headers',
  structuredData: 'Structured Data (JSON-LD)',
  headings: 'Headings (H1–H6)',
  seo: 'SEO Basics',
  coreWebVitals: 'Core Web Vitals',
  mobileA11y: 'Mobile & Accessibility',
  gmc: 'Google Merchant Center',
  googleAds: 'Google Ads Compliance',
  cloudflare: 'Cloudflare',
  firebase: 'Firebase / Backend',
  prerender: 'Prerender.io',
};

function scoreColor(score: number): string {
  if (score >= 90) return 'text-emerald-400';
  if (score >= 70) return 'text-amber-400';
  return 'text-red-400';
}

function borderColor(score: number): string {
  if (score >= 90) return 'border-emerald-500/60 bg-emerald-500/5';
  if (score >= 70) return 'border-amber-500/60 bg-amber-500/5';
  return 'border-red-500/60 bg-red-500/5';
}

export default function AuditReportTab() {
  const [report, setReport] = useState<AuditReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rerunning, setRerunning] = useState(false);

  const load = async (force = false) => {
    if (force) setRerunning(true);
    try {
      const res = await fetch(`/api/public/audit-report${force ? '?force=1' : ''}`, {
        cache: 'no-store',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as AuditReport;
      setReport(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
      setRerunning(false);
    }
  };

  useEffect(() => {
    load(false);
  }, []);

  if (loading) {
    return (
      <div className="p-6 flex items-center gap-2 text-slate-300">
        <Loader2 className="w-4 h-4 animate-spin" /> Running audit…
      </div>
    );
  }
  if (error) return <div className="p-6 text-red-400">Failed to load: {error}</div>;
  if (!report) return null;

  return (
    <div className="p-6 max-w-6xl">
      <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-white mb-1">Comprehensive Audit</h1>
          <p className="text-sm text-slate-400">
            Checked {new Date(report.checkedAt).toLocaleString()}
            {report.cache?.hit
              ? ` · cached ${Math.round(report.cache.ageMs / 1000 / 60)}m ago`
              : ' · fresh'}
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className={`text-4xl font-bold ${scoreColor(report.overallScore)}`}>
            {report.overallScore}
            <span className="text-lg text-slate-500">/100</span>
          </div>
          <button
            onClick={() => load(true)}
            disabled={rerunning}
            className="flex items-center gap-2 px-4 py-2 min-h-[48px] rounded-lg border-2 border-slate-600 bg-slate-800 text-white text-sm hover:bg-slate-700 disabled:opacity-60"
          >
            {rerunning ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Force rerun
          </button>
        </div>
      </div>

      {report.criticalIssues.length > 0 && (
        <Section title="Critical issues" items={report.criticalIssues} tone="critical" />
      )}
      {report.warnings.length > 0 && (
        <Section title="Warnings" items={report.warnings} tone="warning" />
      )}
      {report.recommendations.length > 0 && (
        <Section title="Recommendations" items={report.recommendations} tone="info" />
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
        {Object.entries(report.categories).map(([key, cat]) => (
          <div key={key} className={`p-4 rounded-lg border-2 ${borderColor(cat.score)}`}>
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold text-white">
                {CATEGORY_LABELS[key] ?? key}
              </h3>
              <span className={`font-mono text-lg font-bold ${scoreColor(cat.score)}`}>
                {cat.score}
              </span>
            </div>
            {cat.issues.length > 0 && (
              <ul className="text-xs text-red-300 space-y-1 mb-2">
                {cat.issues.map((iss, i) => (
                  <li key={i}>⚠ {iss}</li>
                ))}
              </ul>
            )}
            {cat.passed.length > 0 && (
              <details className="text-xs text-emerald-300">
                <summary className="cursor-pointer text-slate-400">
                  {cat.passed.length} passed
                </summary>
                <ul className="mt-1 space-y-0.5 pl-4">
                  {cat.passed.map((p, i) => (
                    <li key={i}>✓ {p}</li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        ))}
      </div>

      <div className="mt-6 p-4 rounded-lg border-2 border-slate-700 bg-slate-900">
        <h2 className="font-semibold text-white mb-2">Sampled pages</h2>
        <table className="w-full text-xs font-mono text-slate-300">
          <thead>
            <tr className="text-slate-500">
              <th className="text-left py-1">Path</th>
              <th className="text-right py-1">Status</th>
              <th className="text-right py-1">Time</th>
            </tr>
          </thead>
          <tbody>
            {report.sampledPages.map(p => (
              <tr key={p.path} className="border-t border-slate-800">
                <td className="py-1">{p.path}</td>
                <td className="text-right py-1">{p.status}</td>
                <td className="text-right py-1">{p.ms}ms</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-slate-500 mt-4">
        Endpoint: <code className="text-slate-300">/api/public/audit-report</code>
        {' '}(cached 1h, add <code>?force=1</code> to rerun).
      </p>
    </div>
  );
}

function Section({
  title,
  items,
  tone,
}: {
  title: string;
  items: string[];
  tone: 'critical' | 'warning' | 'info';
}) {
  const cls =
    tone === 'critical'
      ? 'border-red-500/60 bg-red-500/5 text-red-300'
      : tone === 'warning'
      ? 'border-amber-500/60 bg-amber-500/5 text-amber-300'
      : 'border-slate-700 bg-slate-900 text-slate-300';
  return (
    <div className={`mb-4 p-4 rounded-lg border-2 ${cls}`}>
      <h2 className="font-semibold mb-2">
        {title} ({items.length})
      </h2>
      <ul className="text-xs space-y-1">
        {items.map((it, i) => (
          <li key={i}>• {it}</li>
        ))}
      </ul>
    </div>
  );
}
