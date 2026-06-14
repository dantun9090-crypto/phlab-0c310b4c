import { useEffect, useState } from 'react';
import { ShoppingCart, Copy, ExternalLink, RefreshCw, CheckCircle2 } from 'lucide-react';

const FEED_PATH = '/bing-feed.xml';
const PUBLIC_FEED_URL = `https://phlabs.co.uk${FEED_PATH}`;
const PARTNER_URL = 'https://about.ads.microsoft.com/en-us/solutions/microsoft-merchant-center';

export default function BingFeedTab() {
  const [items, setItems] = useState<number | null>(null);
  const [generatedAt, setGeneratedAt] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      // HEAD-style fetch — we only need the headers (item count, generated time).
      const res = await fetch(`${FEED_PATH}?ts=${Date.now()}`, {
        method: 'GET',
        cache: 'no-store',
        headers: { Accept: 'application/xml' },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setItems(Number(res.headers.get('x-feed-items') ?? '0'));
      setGeneratedAt(res.headers.get('x-feed-generated-at') ?? '');
      // Drain body so the connection is released.
      await res.text();
    } catch (e: any) {
      setError(e?.message || 'Failed to fetch feed');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const copyUrl = async () => {
    await navigator.clipboard.writeText(PUBLIC_FEED_URL);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const formattedDate = generatedAt
    ? new Date(generatedAt).toLocaleString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '—';

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="rounded-xl border-2 border-slate-700 bg-slate-900 overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b-2 border-slate-800 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center shrink-0">
            <ShoppingCart className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white">Microsoft Bing Shopping Feed</h1>
            <p className="text-xs text-slate-400">RSS 2.0 product feed for Microsoft Merchant Center</p>
          </div>
        </div>

        {/* Body */}
        <div className="p-6 space-y-6">
          {/* Feed URL block */}
          <div>
            <p className="text-xs uppercase tracking-wider text-slate-400 mb-2">Feed URL</p>
            <code className="block px-3 py-2 rounded-lg bg-slate-950 border-2 border-slate-700 text-emerald-300 text-sm font-mono break-all">
              {PUBLIC_FEED_URL}
            </code>
            <div className="flex gap-2 mt-3 flex-wrap">
              <button
                onClick={copyUrl}
                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 border-2 border-slate-600 text-white text-sm min-h-[48px]"
              >
                {copied ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                {copied ? 'Copied' : 'Copy URL'}
              </button>
              <a
                href={PUBLIC_FEED_URL}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 border-2 border-slate-600 text-white text-sm min-h-[48px]"
              >
                <ExternalLink className="w-4 h-4" /> Open Feed
              </a>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-4 rounded-lg bg-slate-950 border-2 border-slate-700">
              <p className="text-xs uppercase tracking-wider text-slate-400 mb-1">Products in feed</p>
              <p className="text-2xl font-bold text-white">
                {loading ? '…' : items?.toLocaleString('en-GB') ?? '—'}
              </p>
            </div>
            <div className="p-4 rounded-lg bg-slate-950 border-2 border-slate-700">
              <p className="text-xs uppercase tracking-wider text-slate-400 mb-1">Last generated</p>
              <p className="text-sm font-semibold text-white mt-1">{loading ? '…' : formattedDate}</p>
            </div>
          </div>

          {error && (
            <div className="p-3 rounded-lg bg-red-950/40 border-2 border-red-800 text-red-200 text-sm">
              {error}
            </div>
          )}

          {/* Setup instructions */}
          <div className="p-4 rounded-lg bg-slate-950 border-2 border-slate-700">
            <p className="text-sm font-semibold text-white mb-3">📋 Setup Instructions</p>
            <ol className="text-sm text-slate-300 space-y-1.5 list-decimal list-inside leading-relaxed">
              <li>
                Go to{' '}
                <a href="https://partner.microsoft.com" target="_blank" rel="noreferrer" className="text-emerald-400 hover:underline">
                  partner.microsoft.com
                </a>
              </li>
              <li>
                Create store: <span className="font-mono text-white">"PH LABS"</span>{' '}
                — Domain: <span className="font-mono text-white">phlabs.co.uk</span>
              </li>
              <li>Verify domain (DNS or file)</li>
              <li>
                Add feed source: <b className="text-white">URL</b> — Feed URL:{' '}
                <span className="font-mono text-emerald-300 break-all">{PUBLIC_FEED_URL}</span>
              </li>
              <li>Feed type: <b className="text-white">Product feed</b></li>
              <li>Schedule: <b className="text-white">Daily</b></li>
              <li>Country: <b className="text-white">United Kingdom</b></li>
              <li>Currency: <b className="text-white">GBP</b></li>
              <li>Click <b className="text-white">Save & Fetch</b></li>
            </ol>
          </div>

          {/* Actions */}
          <div className="flex gap-2 flex-wrap pt-2">
            <a
              href={PARTNER_URL}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 border-2 border-blue-500 text-white text-sm font-semibold min-h-[48px]"
            >
              📄 Open Microsoft Merchant Center
            </a>
            <button
              onClick={load}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 border-2 border-slate-600 text-white text-sm font-semibold disabled:opacity-50 min-h-[48px]"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              🔄 Regenerate Feed Now
            </button>
          </div>

          <p className="text-xs text-slate-500 leading-relaxed pt-2">
            Feed is generated server-side on every request and cached for 1 hour at the edge.
            All items are submitted as <b>Laboratory Chemicals (RUO)</b> — no medical or
            pharmaceutical categories. Products excluded via the per-product
            <code className="text-emerald-400 mx-1">excludeFromMerchantFeed</code> flag are
            also excluded from the Bing feed.
          </p>
        </div>
      </div>
    </div>
  );
}
