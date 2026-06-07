import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { Loader2, Shield, RefreshCw, Copy, ExternalLink } from 'lucide-react';
import { auth, db, doc, getDoc, onAuthStateChanged } from '@/lib/firebase';

export const Route = createFileRoute('/admin/merchant-feed-preview')({
  head: () => ({
    meta: [
      { title: 'Merchant Feed Preview — Admin' },
      { name: 'robots', content: 'noindex, nofollow' },
    ],
  }),
  component: MerchantFeedPreview,
});

function MerchantFeedPreview() {
  
  const [authChecked, setAuthChecked] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [xml, setXml] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        if (typeof window !== 'undefined') window.location.href = '/login';
        return;
      }
      try {
        const customerDoc = await getDoc(doc(db, 'customers', user.uid));
        setIsAdmin(customerDoc.exists() && customerDoc.data()?.isAdmin === true);
      } catch {
        setIsAdmin(false);
      }
      setAuthChecked(true);
    });
    return () => unsub();
  }, []);

  const loadFeed = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/google-merchant-feed.xml', { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setXml(await res.text());
    } catch (e: any) {
      setError(e?.message || 'Failed to load feed');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAdmin) loadFeed();
  }, [isAdmin]);

  if (!authChecked) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-6">
        <div className="max-w-md text-center">
          <Shield className="w-12 h-12 text-emerald-500 mx-auto mb-4" />
          <h1 className="text-2xl font-semibold mb-2">Admin access required</h1>
          <p className="text-slate-400">This preview is restricted to admin accounts only.</p>
        </div>
      </div>
    );
  }

  const itemCount = (xml.match(/<item>/g) || []).length;
  const sizeKb = (new Blob([xml]).size / 1024).toFixed(1);

  return (
    <div className="min-h-screen bg-slate-950 text-white p-6">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Google Merchant Feed — Preview</h1>
            <p className="text-slate-400 text-sm mt-1">
              Admin-only render of <code className="text-emerald-400">/google-merchant-feed.xml</code>.
              The public URL stays accessible to Merchant Center.
            </p>
          </div>
          <div className="flex gap-2">
            <a
              href="/google-merchant-feed.xml"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-800 border-2 border-slate-700 hover:bg-slate-700 text-sm"
            >
              <ExternalLink className="w-4 h-4" /> Open public XML
            </a>
            <button
              onClick={loadFeed}
              disabled={loading}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-sm disabled:opacity-60"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              Reload
            </button>
            <button
              onClick={async () => {
                await navigator.clipboard.writeText(xml);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
              disabled={!xml}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-800 border-2 border-slate-700 hover:bg-slate-700 text-sm disabled:opacity-60"
            >
              <Copy className="w-4 h-4" /> {copied ? 'Copied' : 'Copy XML'}
            </button>
          </div>
        </div>

        {xml && (
          <div className="flex gap-4 text-sm text-slate-400 mb-3">
            <span>Items: <span className="text-white font-mono">{itemCount}</span></span>
            <span>Size: <span className="text-white font-mono">{sizeKb} KB</span></span>
          </div>
        )}

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-900/30 border border-red-700 text-red-200 text-sm">
            {error}
          </div>
        )}

        <pre className="bg-slate-900 border-2 border-slate-700 rounded-lg p-4 overflow-auto text-xs font-mono text-slate-200 max-h-[75vh] whitespace-pre-wrap break-all">
          {loading ? 'Loading…' : xml || 'No content.'}
        </pre>
      </div>
    </div>
  );
}
