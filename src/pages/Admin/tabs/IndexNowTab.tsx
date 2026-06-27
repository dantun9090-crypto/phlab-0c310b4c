import { useEffect, useRef, useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { toast } from 'sonner';
import { Send, CheckCircle2, XCircle, Loader2, Globe, Clock } from 'lucide-react';
import { submitToIndexNow } from '@/lib/indexnow.functions';

const HOST = 'phlabs.co.uk';

/** Minimum spacing between submissions of the SAME url-set fingerprint. */
const DEDUP_WINDOW_MS = 60_000;

const QUICK_LISTS: Record<string, string[]> = {
  Core: [
    `https://${HOST}/`,
    `https://${HOST}/products`,
    `https://${HOST}/resources`,
    `https://${HOST}/about`,
    `https://${HOST}/contact`,
  ],
  Feeds: [
    `https://${HOST}/sitemap.xml`,
    `https://${HOST}/google-merchant-feed.xml`,
    `https://${HOST}/bing-feed.xml`,
  ],
};

type SubmitOutcome = {
  ok: boolean;
  status: number;
  submitted: number;
  message: string;
  retryAfterMs?: number;
};

function fingerprint(urls: string[]): string {
  return [...urls].map((u) => u.trim()).filter(Boolean).sort().join('\n');
}

export default function IndexNowTab() {
  const submit = useServerFn(submitToIndexNow);
  const [urlsText, setUrlsText] = useState(QUICK_LISTS.Core.join('\n'));
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<SubmitOutcome | null>(null);
  const [retryAt, setRetryAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const recentRef = useRef<Map<string, number>>(new Map());
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 1Hz ticker drives the visible countdown.
  useEffect(() => {
    if (!retryAt) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [retryAt]);

  useEffect(() => () => {
    if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
  }, []);

  const doSubmit = async (urls: string[]): Promise<SubmitOutcome> => {
    const r = (await submit({ data: { urls } })) as SubmitOutcome;
    return r;
  };

  const run = async (opts?: { auto?: boolean }) => {
    const urls = urlsText
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (urls.length === 0) {
      toast.error('No URLs to submit');
      return;
    }

    // Client-side dedup: don't spam the same URL set within DEDUP_WINDOW_MS.
    const fp = fingerprint(urls);
    const last = recentRef.current.get(fp) ?? 0;
    const since = Date.now() - last;
    if (!opts?.auto && since < DEDUP_WINDOW_MS) {
      const wait = Math.ceil((DEDUP_WINDOW_MS - since) / 1000);
      toast.warning('Same URLs already submitted', {
        description: `Wait ${wait}s before re-submitting the identical set.`,
      });
      return;
    }

    setBusy(true);
    setResult(null);
    try {
      const r = await doSubmit(urls);
      recentRef.current.set(fp, Date.now());
      setResult(r);

      if (r.ok) {
        toast.success(`IndexNow accepted ${r.submitted} URL${r.submitted === 1 ? '' : 's'}`, {
          description: r.message,
        });
        setRetryAt(null);
      } else if (r.status === 429 && r.retryAfterMs) {
        const at = Date.now() + r.retryAfterMs;
        setRetryAt(at);
        toast.error('IndexNow rate limit', {
          description: `Auto-retrying in ${Math.round(r.retryAfterMs / 1000)}s. Same URL won't be re-sent until then.`,
        });
        // Schedule a single automatic retry once the window passes.
        if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
        retryTimerRef.current = setTimeout(() => {
          setRetryAt(null);
          run({ auto: true }).catch(() => {});
        }, r.retryAfterMs + 250);
      } else {
        toast.error(`IndexNow HTTP ${r.status}`, { description: r.message });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setResult({ ok: false, status: 0, submitted: 0, message: msg });
      toast.error('IndexNow request failed', { description: msg });
    } finally {
      setBusy(false);
    }
  };

  const countdown = retryAt ? Math.max(0, Math.ceil((retryAt - now) / 1000)) : 0;

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div className="rounded-xl border-2 border-slate-700 bg-slate-900 overflow-hidden">
        <div className="px-6 py-4 border-b-2 border-slate-800 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center">
            <Globe className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white">IndexNow — Instant Indexing</h1>
            <p className="text-xs text-slate-400">Notify Bing / Yandex / Seznam / Naver of new or changed URLs</p>
          </div>
        </div>

        <div className="p-6 space-y-5">
          <div>
            <p className="text-xs uppercase tracking-wider text-slate-400 mb-2">Quick lists</p>
            <div className="flex gap-2 flex-wrap">
              {Object.entries(QUICK_LISTS).map(([name, urls]) => (
                <button
                  key={name}
                  onClick={() => setUrlsText(urls.join('\n'))}
                  className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 border-2 border-slate-600 text-white text-sm min-h-[40px]"
                >
                  {name} ({urls.length})
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs uppercase tracking-wider text-slate-400 mb-2">
              URLs (one per line, max 10,000)
            </label>
            <textarea
              value={urlsText}
              onChange={(e) => setUrlsText(e.target.value)}
              rows={10}
              className="w-full px-3 py-2 rounded-lg bg-slate-800 border-2 border-slate-600 text-white text-sm font-mono min-h-[200px]"
              placeholder={`https://${HOST}/some-page`}
            />
            <p className="text-xs text-slate-500 mt-1">
              Only URLs on <code className="text-emerald-400">{HOST}</code> are accepted.
              Same URL set is rate-limited to once per {DEDUP_WINDOW_MS / 1000}s on the client.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => run()}
              disabled={busy || !urlsText.trim() || countdown > 0}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 border-2 border-blue-500 text-white text-sm font-semibold disabled:opacity-50 min-h-[48px]"
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              {countdown > 0 ? `Retrying in ${countdown}s…` : 'Submit to IndexNow'}
            </button>
            {countdown > 0 && (
              <span className="inline-flex items-center gap-1 text-xs text-amber-300">
                <Clock className="w-3 h-3" /> Auto-retry scheduled (HTTP 429 backoff)
              </span>
            )}
          </div>

          {result && (
            <div
              className={`p-4 rounded-lg border-2 ${
                result.ok
                  ? 'bg-emerald-950/40 border-emerald-700 text-emerald-200'
                  : result.status === 429
                    ? 'bg-amber-950/40 border-amber-700 text-amber-200'
                    : 'bg-red-950/40 border-red-800 text-red-200'
              }`}
            >
              <div className="flex items-center gap-2 font-semibold">
                {result.ok ? <CheckCircle2 className="w-5 h-5" /> : <XCircle className="w-5 h-5" />}
                HTTP {result.status} · {result.submitted} URL{result.submitted === 1 ? '' : 's'} submitted
              </div>
              <p className="text-sm mt-1">{result.message}</p>
              {result.status === 429 && result.retryAfterMs && (
                <p className="text-xs mt-2 opacity-80">
                  Retry-After: {Math.round(result.retryAfterMs / 1000)}s — admin will auto-retry once.
                </p>
              )}
            </div>
          )}

          <div className="p-4 rounded-lg bg-slate-950 border-2 border-slate-700 text-xs text-slate-400 leading-relaxed">
            <p className="text-sm font-semibold text-white mb-2">📋 How it works</p>
            <ol className="space-y-1 list-decimal list-inside">
              <li>
                Key file is served at{' '}
                <code className="text-emerald-400">https://{HOST}/{'{key}'}.txt</code> from the{' '}
                <code className="text-emerald-400">BING_INDEXNOW_API_KEY</code> secret.
              </li>
              <li>POST sends host + key + keyLocation + urlList to api.indexnow.org/IndexNow.</li>
              <li>200/202 = accepted. 403 = key file not reachable. 422 = host mismatch. 429 = auto-retry after Retry-After.</li>
              <li>One ping covers Bing, Yandex, Seznam, and Naver (shared network).</li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}
