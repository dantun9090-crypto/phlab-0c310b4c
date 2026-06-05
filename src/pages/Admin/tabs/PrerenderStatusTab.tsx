import { useState, useEffect } from 'react';
import { useServerFn } from '@tanstack/react-start';
import {
  Activity, RefreshCw, Loader2, CheckCircle2, XCircle, AlertTriangle,
  Globe, ExternalLink, Zap,
} from 'lucide-react';
import {
  probePrerenderStatus,
  recachePrerenderUrl,
  checkPrerenderTokenLength,
  type ProbeResult,
} from '@/lib/prerender-status.functions';
import { auth } from '@/lib/firebase';


interface RecacheLog {
  url: string;
  ok: boolean;
  status: number;
  message: string;
  at: string;
}

export default function PrerenderStatusTab() {
  const probe = useServerFn(probePrerenderStatus);
  const recache = useServerFn(recachePrerenderUrl);
  const [results, setResults] = useState<ProbeResult[]>([]);
  const [checkedAt, setCheckedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [customUrl, setCustomUrl] = useState('');
  const [recachingUrl, setRecachingUrl] = useState<string | null>(null);
  const [recacheLog, setRecacheLog] = useState<RecacheLog[]>([]);

  const runProbe = async (urls?: string[]) => {
    setLoading(true);
    try {
      const res = await probe({ data: urls ? { urls } : {} });
      setResults(res.results);
      setCheckedAt(res.checkedAt);
    } catch (err) {
      console.error('probe failed', err);
    } finally {
      setLoading(false);
    }
  };

  const runRecache = async (url: string) => {
    setRecachingUrl(url);
    try {
      const idToken = await auth.currentUser?.getIdToken() ?? '';
      const res = await recache({ data: { url, idToken } });
      setRecacheLog((prev) => [
        {
          url,
          ok: res.ok,
          status: res.status,
          message: res.ok ? 'Queued for recache' : res.response || `HTTP ${res.status}`,
          at: res.recachedAt,
        },
        ...prev,
      ].slice(0, 10));
    } catch (err) {
      setRecacheLog((prev) => [
        {
          url,
          ok: false,
          status: 0,
          message: err instanceof Error ? err.message : String(err),
          at: new Date().toISOString(),
        },
        ...prev,
      ].slice(0, 10));
    } finally {
      setRecachingUrl(null);
    }
  };

  useEffect(() => { runProbe(); /* eslint-disable-next-line */ }, []);

  const verdict = (r: ProbeResult): { label: string; tone: 'ok' | 'warn' | 'bad' } => {
    if (r.error) return { label: 'Network error', tone: 'bad' };
    if (r.status === 0) return { label: 'No response', tone: 'bad' };
    if (r.status >= 300 && r.status < 400) return { label: `Redirect ${r.status}`, tone: 'ok' };
    if (r.detectedNotFound) return { label: 'Soft / hard 404', tone: 'bad' };
    if (r.bodyLooksEmpty) return { label: 'Empty render', tone: 'warn' };
    if (r.ok && r.prerendered) return { label: 'Prerendered OK', tone: 'ok' };
    if (r.ok) return { label: 'OK (not prerendered)', tone: 'warn' };
    return { label: `HTTP ${r.status}`, tone: 'bad' };
  };

  const toneClass = (tone: 'ok' | 'warn' | 'bad') =>
    tone === 'ok'   ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' :
    tone === 'warn' ? 'text-amber-400 bg-amber-500/10 border-amber-500/20' :
                      'text-red-400 bg-red-500/10 border-red-500/20';

  return (
    <div className="p-4 sm:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Activity className="w-5 h-5 text-blue-400" />
            Prerender Status
          </h2>
          <p className="text-sm text-[#9cb8d9] mt-1">
            Live probe of canonical and legacy domains as Googlebot — HTTP code, redirect target, Prerender headers, and soft-404 detection.
            {checkedAt && <span className="ml-2 text-[#3a5a82]">Last check: {new Date(checkedAt).toLocaleTimeString('en-GB')}</span>}
          </p>
        </div>
        <button
          onClick={() => runProbe()}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          Re-check
        </button>
      </div>

      {/* Probe custom URL */}
      <div className="bg-[#0b1a30]/70 border border-white/[0.07] rounded-xl p-4 flex flex-col sm:flex-row gap-2">
        <input
          type="url"
          value={customUrl}
          onChange={(e) => setCustomUrl(e.target.value)}
          placeholder="https://phlabs.co.uk/some-path"
          className="flex-1 min-h-[44px] px-3 py-2 bg-slate-800 border-2 border-slate-600 rounded-lg text-white text-sm placeholder:text-slate-500 focus:border-blue-500 outline-none"
        />
        <button
          onClick={() => customUrl.trim() && runProbe([customUrl.trim()])}
          disabled={loading || !customUrl.trim()}
          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white rounded-lg text-sm font-medium transition-colors min-h-[44px]"
        >
          Probe URL
        </button>
        <button
          onClick={() => { setCustomUrl(''); runProbe(); }}
          disabled={loading}
          className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm font-medium transition-colors min-h-[44px]"
        >
          Reset to defaults
        </button>
      </div>

      {/* Auto-recache hook status */}
      <AutoRecacheCard />


      {/* Results */}
      <div className="space-y-3">
        {loading && results.length === 0 && (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-blue-400" />
          </div>
        )}
        {results.map((r) => {
          const v = verdict(r);
          return (
            <div key={r.url} className="bg-[#0b1a30]/70 border border-white/[0.07] rounded-xl p-4">
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <Globe className="w-4 h-4 text-[#9cb8d9] shrink-0" />
                    <a href={r.url} target="_blank" rel="noopener noreferrer"
                       className="text-white text-sm font-medium font-mono truncate hover:text-blue-400 transition-colors">
                      {r.url}
                    </a>
                    <ExternalLink className="w-3 h-3 text-[#3a5a82] shrink-0" />
                  </div>
                  {r.redirectedTo && (
                    <p className="text-xs text-[#9cb8d9] mt-1 ml-6 font-mono break-all">
                      → {r.redirectedTo}
                    </p>
                  )}
                  {r.error && (
                    <p className="text-xs text-red-400 mt-1 ml-6">{r.error}</p>
                  )}
                </div>
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium shrink-0 ${toneClass(v.tone)}`}>
                  {v.tone === 'ok' && <CheckCircle2 className="w-3.5 h-3.5" />}
                  {v.tone === 'warn' && <AlertTriangle className="w-3.5 h-3.5" />}
                  {v.tone === 'bad' && <XCircle className="w-3.5 h-3.5" />}
                  {v.label}
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                <Stat label="HTTP" value={r.status > 0 ? String(r.status) : '—'} />
                <Stat label="Meta 404"
                  value={r.metaStatusCode != null ? String(r.metaStatusCode) : 'none'}
                  tone={r.metaStatusCode === 404 ? 'bad' : 'neutral'} />
                <Stat label="x-prerendered"
                  value={r.prerendered ? 'yes' : 'no'}
                  tone={r.prerendered ? 'ok' : 'neutral'} />
                <Stat label="Cache"
                  value={r.prerenderCache || r.cfCache || '—'} />
                <Stat label="Size" value={r.bytes > 0 ? `${(r.bytes / 1024).toFixed(1)} KB` : '—'} />
                <Stat label="Time" value={`${r.durationMs} ms`} />
                <Stat label="Body empty"
                  value={r.bodyLooksEmpty ? 'yes' : 'no'}
                  tone={r.bodyLooksEmpty ? 'warn' : 'neutral'} />
                <Stat label="Detected 404"
                  value={r.detectedNotFound ? 'yes' : 'no'}
                  tone={r.detectedNotFound ? 'bad' : 'ok'} />
              </div>

              <div className="mt-3 flex justify-end">
                <button
                  onClick={() => runRecache(r.url)}
                  disabled={recachingUrl === r.url}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-600/90 hover:bg-amber-500 disabled:opacity-40 text-white rounded-md text-xs font-medium transition-colors"
                  title="Force Prerender.io to re-crawl and refresh the cached snapshot"
                >
                  {recachingUrl === r.url
                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    : <Zap className="w-3.5 h-3.5" />}
                  Recache in Prerender.io
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Recache log */}
      {recacheLog.length > 0 && (
        <div className="bg-[#0b1a30]/70 border border-white/[0.07] rounded-xl p-4">
          <h3 className="text-sm font-semibold text-white mb-2 flex items-center gap-2">
            <Zap className="w-4 h-4 text-amber-400" /> Recent recache requests
          </h3>
          <div className="space-y-1.5">
            {recacheLog.map((l, i) => (
              <div key={i} className="flex items-center gap-2 text-xs font-mono">
                <span className={l.ok ? 'text-emerald-400' : 'text-red-400'}>
                  {l.ok ? '✓' : '✗'} {l.status || 'ERR'}
                </span>
                <span className="text-white truncate flex-1">{l.url}</span>
                <span className="text-[#9cb8d9] truncate max-w-[40%]">{l.message}</span>
                <span className="text-[#3a5a82]">{new Date(l.at).toLocaleTimeString('en-GB')}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="bg-[#0b1a30]/70 border border-white/[0.07] rounded-xl p-4 text-xs text-[#9cb8d9] space-y-1.5">
        <p className="font-semibold text-white mb-2">What this checks</p>
        <p>• Fetches each URL with a real Googlebot User-Agent, so you see what bots see (Cloudflare → Prerender.io → origin).</p>
        <p>• <span className="text-white">Meta 404</span> = the page rendered <code className="text-emerald-400">{'<meta name="prerender-status-code" content="404">'}</code> — Prerender.io will mark it as 404 for crawlers even if HTTP was 200.</p>
        <p>• <span className="text-white">x-prerendered: yes</span> means our edge served the Prerender.io snapshot instead of raw SSR.</p>
        {/* check-domains-allow-next-line */}
        <p>• <span className="text-white">Redirect 301</span> on legacy product slugs and prohealthpeptides.co.uk URLs is correct — Cloudflare should send them to <code className="text-emerald-400">https://phlabs.co.uk</code>.</p>
      </div>
    </div>
  );
}

function AutoRecacheCard() {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; status: number; message: string; at: string } | null>(null);

  const run = async () => {
    setRunning(true);
    try {
      const res = await fetch('/api/public/hooks/prerender-recache?force=1', { method: 'POST' });
      const body = await res.text();
      setResult({
        ok: res.ok,
        status: res.status,
        message: body.slice(0, 400),
        at: new Date().toISOString(),
      });
    } catch (err) {
      setResult({
        ok: false,
        status: 0,
        message: err instanceof Error ? err.message : String(err),
        at: new Date().toISOString(),
      });
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="bg-[#0b1a30]/70 border border-white/[0.07] rounded-xl p-4">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <Zap className="w-4 h-4 text-amber-400" />
            Automatic recache after Publish
          </h3>
          <p className="text-xs text-[#9cb8d9] mt-1">
            A scheduled job runs every <span className="text-white">15 minutes</span> and POSTs every sitemap URL
            to Prerender.io (desktop + mobile). After clicking <span className="text-white">Publish → Update</span>,
            the new build is reflected in the bot cache within ~15 min — no manual action needed.
          </p>
          <p className="text-xs text-[#3a5a82] mt-1 font-mono">
            POST /api/public/hooks/prerender-recache (cron <code className="text-emerald-400">*/15 * * * *</code>)
          </p>
        </div>
        <button
          onClick={run}
          disabled={running}
          className="px-3 py-2 bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-white rounded-lg text-xs font-medium transition-colors min-h-[40px] flex items-center gap-2 shrink-0"
        >
          {running ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
          Run now
        </button>
      </div>
      {result && (
        <div className={`mt-3 text-xs font-mono p-2 rounded border ${result.ok ? 'bg-emerald-500/5 border-emerald-500/20 text-emerald-300' : 'bg-red-500/5 border-red-500/20 text-red-300'}`}>
          <div className="flex justify-between mb-1">
            <span>{result.ok ? '✓ Triggered' : '✗ Failed'} — HTTP {result.status}</span>
            <span className="text-[#9cb8d9]">{new Date(result.at).toLocaleTimeString('en-GB')}</span>
          </div>
          <div className="text-[#9cb8d9] break-all whitespace-pre-wrap max-h-32 overflow-auto">{result.message}</div>
        </div>
      )}
    </div>
  );
}



function Stat({ label, value, tone = 'neutral' }: { label: string; value: string; tone?: 'ok' | 'warn' | 'bad' | 'neutral' }) {
  const cls =
    tone === 'ok'   ? 'text-emerald-400' :
    tone === 'warn' ? 'text-amber-400'   :
    tone === 'bad'  ? 'text-red-400'     : 'text-white';
  return (
    <div className="bg-slate-900/60 border border-white/[0.04] rounded-md px-2.5 py-1.5">
      <div className="text-[10px] uppercase tracking-wider text-[#3a5a82]">{label}</div>
      <div className={`text-xs font-mono font-medium truncate ${cls}`}>{value}</div>
    </div>
  );
}
