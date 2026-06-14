import { useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { Loader2, Trash2, Zap, AlertTriangle, CheckCircle2, XCircle, Cloud, RefreshCw } from 'lucide-react';
import {
  purgeCloudflareCache,
  recacheSitemapPrerender,
} from '@/lib/cache-admin.functions';
import { auth } from '@/lib/firebase';

import { getAdminIdToken } from '@/lib/auth-ready';
interface OpResult {
  kind: 'purge' | 'recache';
  ok: boolean;
  detail: string;
  at: string;
}

export default function CacheRecacheTab() {
  const purgeFn = useServerFn(purgeCloudflareCache);
  const recacheFn = useServerFn(recacheSitemapPrerender);

  const [purging, setPurging] = useState(false);
  const [recaching, setRecaching] = useState(false);
  const [filesText, setFilesText] = useState('');
  const [includeMobile, setIncludeMobile] = useState(true);
  const [log, setLog] = useState<OpResult[]>([]);

  const pushLog = (entry: OpResult) =>
    setLog((prev) => [entry, ...prev].slice(0, 20));

  const runPurgeEverything = async () => {
    if (!confirm('Purge the ENTIRE Cloudflare cache for phlabs.co.uk? Returning visitors will get a cache MISS on the next request.')) {
      return;
    }
    setPurging(true);
    try {
      const idToken = await getAdminIdToken();
      const res = await purgeFn({ data: { idToken, purgeEverything: true } });
      pushLog({
        kind: 'purge',
        ok: res.ok,
        detail: res.ok
          ? `Purged everything (HTTP ${res.status}, ${('durationMs' in res ? res.durationMs : 0)} ms)`
          : `Failed: ${('error' in res && res.error) || ('response' in res ? res.response : '')} (HTTP ${res.status})`,
        at: new Date().toISOString(),
      });
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
      const res = await purgeFn({ data: { idToken, purgeEverything: false, files } });
      pushLog({
        kind: 'purge',
        ok: res.ok,
        detail: res.ok
          ? `Purged ${files.length} URL(s) (HTTP ${res.status})`
          : `Failed: ${('error' in res && res.error) || ('response' in res ? res.response : '')} (HTTP ${res.status})`,
        at: new Date().toISOString(),
      });
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
          Public HTML uses a short 60-second edge cache; private routes, service workers, recovery URLs, and 404 HTML stay no-store so bad publishes and stale product URLs do not stick.
          Use the buttons below for ad-hoc purges or to re-trigger manually.
        </p>
      </div>

      {/* Cloudflare full purge */}
      <div className="bg-[#0b1a30]/70 border border-white/[0.07] rounded-xl p-4 space-y-3">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center justify-center shrink-0">
            <Trash2 className="w-4 h-4 text-red-400" />
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-white">Purge Cloudflare cache — everything</h3>
            <p className="text-xs text-[#9cb8d9] mt-1">
              Calls <code className="text-emerald-400">POST /zones/{`{zone}`}/purge_cache</code> with{' '}
              <code className="text-emerald-400">{`{"purge_everything": true}`}</code>. Removes every cached HTML, asset and prerender
              snapshot on Cloudflare&apos;s edge for the phlabs.co.uk zone. Product edits automatically purge the affected product/category URLs and recache desktop + mobile bot snapshots.
            </p>
            <div className="mt-2 flex items-start gap-2 text-xs text-amber-300/90">
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span>Next visitor on every URL pays a cache-MISS (≈ 500–800&nbsp;ms instead of ≈ 50&nbsp;ms).</span>
            </div>
          </div>
        </div>
        <button
          onClick={runPurgeEverything}
          disabled={purging}
          className="w-full sm:w-auto min-h-[48px] px-4 py-2 bg-red-600 hover:bg-red-500 disabled:opacity-40 text-white rounded-lg text-sm font-semibold transition-colors flex items-center justify-center gap-2"
        >
          {purging ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
          Purge everything
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
    </div>
  );
}
