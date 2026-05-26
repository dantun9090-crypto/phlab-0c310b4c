import { useState, useEffect } from 'react';
import { db, doc, getDoc, setDoc, collection, getDocs } from '@/lib/firebase';
import { Search, Globe, FileText, Package, BookOpen, Save, AlertCircle, CheckCircle2, Eye, Image as ImageIcon, RefreshCw, Map, Zap, ExternalLink, Key, Loader2, Trash2, Clock, Gauge, SearchCode } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

type SubTab = 'global' | 'pages' | 'products' | 'resources' | 'prerender';

interface SEOData {
  title: string;
  metaDescription: string;
  metaKeywords?: string;
  canonical?: string;
  ogImage?: string;
}

interface GlobalSEO {
  defaultTitleSuffix: string;
  defaultMetaDescription: string;
  siteOGImage: string;
}

interface PagesSEO {
  home: SEOData;
  about: SEOData;
  contact: SEOData;
  terms: SEOData;
  privacy: SEOData;
  cookies: SEOData;
}

export default function SEOTab() {
  const [subTab, setSubTab] = useState<SubTab>('global');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // ── Prerender.io state ───────────────────────────────────────────────────────
  const [prerenderToken, setPrerenderToken] = useState(
    () => localStorage.getItem('php_prerender_token') || ''
  );
  const [tokenSaving, setTokenSaving] = useState(false);
  const [tokenSaved, setTokenSaved] = useState(false);
  const [recaching, setRecaching] = useState(false);
  const [submittingSitemap, setSubmittingSitemap] = useState(false);
  const [clearingCache, setClearingCache] = useState(false);
  const [prerenderLog, setPrerenderLog] = useState<{ type: 'success' | 'error' | 'info'; text: string; ts: string }[]>([]);
  const [productSlugs, setProductSlugs] = useState<string[]>([]);
  const [slugsLoading, setSlugsLoading] = useState(false);
  const [lastRecacheTs, setLastRecacheTs] = useState<string | null>(
    () => localStorage.getItem('php_last_recache')
  );

  // Cache Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<{ url: string; cachedAt?: string; adaptiveType?: string }[] | null>(null);
  const [searchError, setSearchError] = useState('');

  // Change Recache Speed state
  const [speedValue, setSpeedValue] = useState(0); // 0 = auto
  const [settingSpeed, setSettingSpeed] = useState(false);
  const [speedResult, setSpeedResult] = useState<{ delayBetweenURLs?: number; num1Hour?: number; num1Day?: number; isAutomaticDelay?: boolean } | null>(null);

  // Cache Status state
  const [cacheStatusCount, setCacheStatusCount] = useState<number | null>(null);
  const [loadingCacheStatus, setLoadingCacheStatus] = useState(false);
  const [cacheStatusError, setCacheStatusError] = useState('');

  // Direct fetch to Prerender.io — they support CORS for authenticated requests.
  // NOTE: We intentionally do NOT fall back to public CORS proxies (e.g. corsproxy.io)
  // because the request body contains the prerenderToken — a third-party proxy operator
  // could log/capture it. If the direct call fails, surface the error and instruct the
  // admin to use the curl commands below (token never leaves their machine).
  const prerenderFetch = async (endpoint: string, body: Record<string, unknown>): Promise<Response> => {
    const target = `https://api.prerender.io${endpoint}`;
    const payload = JSON.stringify({ prerenderToken: prerenderToken.trim(), ...body });

    const res = await Promise.race([
      fetch(target, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: payload,
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Prerender.io request timed out — use the curl commands below from a terminal.')), 10000),
      ),
    ]);
    return res as Response;
  };


  const SITEMAP_URL = 'https://www.prohealthpeptides.co.uk/sitemap.xml';

  const KEY_URLS = [
    'https://www.prohealthpeptides.co.uk/',
    'https://www.prohealthpeptides.co.uk/products',
    'https://www.prohealthpeptides.co.uk/products?category=tissue-repair',
    'https://www.prohealthpeptides.co.uk/products?category=metabolic-signaling',
    'https://www.prohealthpeptides.co.uk/products?category=cellular-aging',
    'https://www.prohealthpeptides.co.uk/products?category=neurological',
    'https://www.prohealthpeptides.co.uk/products?category=melanin',
    'https://www.prohealthpeptides.co.uk/products?category=blends',
    'https://www.prohealthpeptides.co.uk/products?category=accessories',
    'https://www.prohealthpeptides.co.uk/lab-reports',
    'https://www.prohealthpeptides.co.uk/research',
    'https://www.prohealthpeptides.co.uk/resources',
    'https://www.prohealthpeptides.co.uk/about',
    'https://www.prohealthpeptides.co.uk/contact',
    'https://www.prohealthpeptides.co.uk/search',
    'https://www.prohealthpeptides.co.uk/storage-guide',
    'https://www.prohealthpeptides.co.uk/refund-policy',
    'https://www.prohealthpeptides.co.uk/shipping-policy',
    'https://www.prohealthpeptides.co.uk/privacy-policy',
    'https://www.prohealthpeptides.co.uk/terms-and-conditions',
    'https://www.prohealthpeptides.co.uk/cookies',
  ];

  const addLog = (type: 'success' | 'error' | 'info', text: string) => {
    const ts = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    setPrerenderLog(prev => [{ type, text, ts }, ...prev].slice(0, 50));
  };

  const saveToken = async () => {
    if (!prerenderToken.trim()) return;
    setTokenSaving(true);
    // Store ONLY in localStorage — never write to Firestore. The `settings` collection
    // is publicly readable, so persisting the Prerender.io API token there would expose
    // it to any visitor. localStorage keeps it on the admin's device only.
    try {
      localStorage.setItem('php_prerender_token', prerenderToken.trim());
      // Clean up any previously-stored token in Firestore (best-effort).
      try {
        await setDoc(doc(db, 'settings', 'prerenderio'), { token: '' }, { merge: true });
      } catch { /* ignore */ }
      setTokenSaved(true);
      setTimeout(() => setTokenSaved(false), 3000);
    } finally {
      setTokenSaving(false);
    }
  };


  const BASE = 'https://www.prohealthpeptides.co.uk';

  const getAllUrls = () => [
    ...KEY_URLS,
    ...productSlugs.map(slug => `${BASE}/products/${slug}`),
  ];

  const handleRecacheAll = async () => {
    if (!prerenderToken.trim()) { addLog('error', 'No API token set — save your Prerender.io token first'); return; }
    const urls = getAllUrls();
    setRecaching(true);
    addLog('info', `Recaching ${urls.length} pages (${KEY_URLS.length} core + ${productSlugs.length} products)…`);
    try {
      const res = await prerenderFetch('/recache', { urls });
      if (res.ok) {
        addLog('success', `✓ Recache queued for ${urls.length} pages — Prerender.io will refresh them now`);
        const ts = new Date().toISOString();
        localStorage.setItem('php_last_recache', ts);
        setLastRecacheTs(ts);
        localStorage.removeItem('php_recache_pending');
        window.dispatchEvent(new CustomEvent('admin:recache-done'));
      } else {
        const text = await res.text();
        addLog('error', `Recache failed (${res.status}): ${text.slice(0, 120)}`);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Unknown error';
      addLog('error', `Network error: ${msg}`);
      addLog('info', `Run manually in terminal:\ncurl -X POST https://api.prerender.io/recache \\\n  -H "Content-Type: application/json" \\\n  -d '{"prerenderToken":"${prerenderToken.trim()}","urls":[...]}'`);
    } finally {
      setRecaching(false);
    }
  };

  const handleRecacheProductsOnly = async () => {
    if (!prerenderToken.trim()) { addLog('error', 'No API token set — save your Prerender.io token first'); return; }
    if (productSlugs.length === 0) { addLog('error', 'No product slugs loaded — click Refresh Products first'); return; }
    const urls = productSlugs.map(slug => `${BASE}/products/${slug}`);
    setRecaching(true);
    addLog('info', `Recaching ${urls.length} product pages only…`);
    try {
      const res = await prerenderFetch('/recache', { urls });
      if (res.ok) {
        addLog('success', `✓ Recache queued for ${urls.length} product pages`);
      } else {
        const text = await res.text();
        addLog('error', `Recache failed (${res.status}): ${text.slice(0, 120)}`);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Unknown error';
      addLog('error', `Network error: ${msg}`);
    } finally {
      setRecaching(false);
    }
  };

  const handleRecacheMobile = async () => {
    if (!prerenderToken.trim()) { addLog('error', 'No API token set'); return; }
    const urls = getAllUrls();
    setRecaching(true);
    addLog('info', `Recaching ${urls.length} mobile pages…`);
    try {
      const res = await prerenderFetch('/recache', { urls, adaptiveType: 'mobile' });
      if (res.ok) {
        addLog('success', `✓ Mobile recache queued for ${urls.length} pages`);
        const ts = new Date().toISOString();
        localStorage.setItem('php_last_recache', ts);
        setLastRecacheTs(ts);
        localStorage.removeItem('php_recache_pending');
        window.dispatchEvent(new CustomEvent('admin:recache-done'));
      } else {
        addLog('error', `Mobile recache failed (${res.status})`);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Unknown error';
      addLog('error', `Network error: ${msg}`);
      addLog('info', `Run manually:\ncurl -X POST https://api.prerender.io/recache \\\n  -H "Content-Type: application/json" \\\n  -d '{"prerenderToken":"${prerenderToken.trim()}","adaptiveType":"mobile","urls":[...]}'`);
    } finally {
      setRecaching(false);
    }
  };

  const handleSubmitSitemap = async () => {
    if (!prerenderToken.trim()) { addLog('error', 'No API token set — save your Prerender.io token first'); return; }
    setSubmittingSitemap(true);
    addLog('info', `Submitting sitemap to Prerender.io: ${SITEMAP_URL}`);
    try {
      const res = await prerenderFetch('/sitemap', { url: SITEMAP_URL });
      if (res.ok) {
        addLog('success', `✓ Sitemap submitted — Prerender.io will cache any new URLs found`);
      } else {
        const text = await res.text();
        addLog('error', `Sitemap submission failed (${res.status}): ${text.slice(0, 120)}`);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Unknown error';
      addLog('error', `Network error: ${msg}`);
      addLog('info', `Run manually:\ncurl -X POST https://api.prerender.io/sitemap \\\n  -H "Content-Type: application/json" \\\n  -d '{"prerenderToken":"${prerenderToken.trim()}","url":"${SITEMAP_URL}"}'`);
    } finally {
      setSubmittingSitemap(false);
    }
  };

  const handleCacheClear = async () => {
    if (!prerenderToken.trim()) { addLog('error', 'No API token set'); return; }
    if (!window.confirm('This will remove ALL cached pages for prohealthpeptides.co.uk from Prerender.io. They will be re-rendered fresh on next request. Continue?')) return;
    setClearingCache(true);
    addLog('info', 'Scheduling full cache clear for prohealthpeptides.co.uk…');
    try {
      const res = await prerenderFetch('/cache-clear', { query: 'https://www.prohealthpeptides.co.uk%' });
      if (res.ok) {
        addLog('success', '✓ Cache clear scheduled — all pages will be re-rendered on next request');
      } else if (res.status === 403) {
        addLog('error', 'A cache clear is already in progress — wait for it to complete');
      } else {
        const text = await res.text();
        addLog('error', `Cache clear failed (${res.status}): ${text.slice(0, 120)}`);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Unknown error';
      addLog('error', `Network error: ${msg}`);
      addLog('info', `Run manually:\ncurl -X POST https://api.prerender.io/cache-clear \\\n  -H "Content-Type: application/json" \\\n  -d '{"prerenderToken":"${prerenderToken.trim()}","query":"https://www.prohealthpeptides.co.uk%"}'`);
    } finally {
      setClearingCache(false);
    }
  };

  const handleCacheSearch = async () => {
    if (!prerenderToken.trim()) { setSearchError('No API token set'); return; }
    if (!searchQuery.trim()) { setSearchError('Enter a URL or path to search'); return; }
    setSearching(true);
    setSearchResults(null);
    setSearchError('');
    try {
      const res = await prerenderFetch('/search', { query: searchQuery.trim(), start: 0 });
      if (res.ok) {
        const data = await res.json();
        const results = Array.isArray(data) ? data : (data.results || data.urls || []);
        setSearchResults(results);
        if (results.length === 0) setSearchError('No cached pages found matching that query');
      } else {
        const text = await res.text();
        setSearchError(`Search failed (${res.status}): ${text.slice(0, 100)}`);
      }
    } catch (e: unknown) {
      setSearchError(e instanceof Error ? e.message : 'Network error');
    } finally {
      setSearching(false);
    }
  };

  const handleChangeSpeed = async () => {
    if (!prerenderToken.trim()) { addLog('error', 'No API token set'); return; }
    setSettingSpeed(true);
    addLog('info', speedValue === 0 ? 'Reverting to automatic recache speed…' : `Setting recache speed to ${speedValue.toLocaleString()} URLs/hr…`);
    try {
      const res = await prerenderFetch('/change-recache-speed', { urlsPerHour: speedValue });
      if (res.ok) {
        const data = await res.json();
        setSpeedResult(data.recacheMetrics ? { ...data.recacheMetrics, isAutomaticDelay: data.isAutomaticDelay } : { isAutomaticDelay: true });
        addLog('success', data.isAutomaticDelay ? '✓ Recache speed set to automatic' : `✓ Speed set — ~${data.recacheMetrics?.num1Hour ?? '?'} pages/hr`);
      } else {
        const text = await res.text();
        addLog('error', `Speed change failed (${res.status}): ${text.slice(0, 100)}`);
      }
    } catch (e: unknown) {
      addLog('error', `Network error: ${e instanceof Error ? e.message : 'Unknown error'}`);
    } finally {
      setSettingSpeed(false);
    }
  };

  const handleCacheStatus = async () => {
    if (!prerenderToken.trim()) { setCacheStatusError('No API token set'); return; }
    setLoadingCacheStatus(true);
    setCacheStatusError('');
    setCacheStatusCount(null);
    try {
      // Paginate through all cached pages to get total count
      let total = 0;
      let start = 0;
      const pageSize = 100;
      while (true) {
        const res = await prerenderFetch('/search', { query: 'prohealthpeptides.co.uk', start, pageSize });
        if (!res.ok) {
          const text = await res.text();
          setCacheStatusError(`Failed (${res.status}): ${text.slice(0, 100)}`);
          break;
        }
        const data = await res.json();
        const results = Array.isArray(data) ? data : (data.results || data.urls || []);
        total += results.length;
        if (results.length < pageSize) break;
        start += pageSize;
      }
      setCacheStatusCount(total);
      addLog('success', `✓ Cache status: ${total} pages currently cached`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Network error';
      setCacheStatusError(msg);
      addLog('error', `Cache status check failed — Prerender.io API does not allow browser access. Check cache count at dashboard.prerender.io`);
    } finally {
      setLoadingCacheStatus(false);
    }
  };

  // Global SEO
  const [globalSEO, setGlobalSEO] = useState<GlobalSEO>({
    defaultTitleSuffix: '| PH Labs',
    defaultMetaDescription: 'Buy HPLC-tested research peptides in the UK — BPC-157, TB-500, GLP-1 compounds. ≥99% purity, CoA included, free shipping over £50. Laboratory use only.',
    siteOGImage: '',
  });

  // Pages SEO
  const [pagesSEO, setPagesSEO] = useState<PagesSEO>({
    home: {
      title: 'Buy Research Peptides UK | HPLC-Verified | PH Labs',
      metaDescription: 'Buy HPLC-tested research peptides in the UK — BPC-157, TB-500, GLP-1 compounds. ≥99% purity, CoA included, free shipping over £50. Laboratory use only.',
      metaKeywords: '',
      canonical: 'https://www.prohealthpeptides.co.uk/',
      ogImage: '',
    },
    about: {
      title: 'About Us | HPLC-Verified Peptide Supplier UK | PH Labs',
      metaDescription: 'About PH Labs UK | HPLC-Verified Research Peptide Supplier — Quality standards, testing protocols, and UK delivery.',
      metaKeywords: '',
      canonical: 'https://www.prohealthpeptides.co.uk/about',
      ogImage: '',
    },
    contact: {
      title: 'Contact | PH Labs UK',
      metaDescription: 'Contact PH Labs UK | Research Peptide Support — Customer service, wholesale inquiries, and lab partnerships.',
      metaKeywords: '',
      canonical: 'https://www.prohealthpeptides.co.uk/contact',
      ogImage: '',
    },
    terms: {
      title: 'Terms of Service | PH Labs UK',
      metaDescription: 'Terms of Service for PH Labs UK — Research peptide purchase terms, laboratory use policy, and legal conditions.',
      metaKeywords: '',
      canonical: 'https://www.prohealthpeptides.co.uk/terms-of-service',
      ogImage: '',
    },
    privacy: {
      title: 'Privacy Policy | PH Labs UK',
      metaDescription: 'Privacy Policy for PH Labs UK — How we collect, use, and protect your personal data.',
      metaKeywords: '',
      canonical: 'https://www.prohealthpeptides.co.uk/privacy-policy',
      ogImage: '',
    },
    cookies: {
      title: 'Cookie Policy | PH Labs UK',
      metaDescription: 'Cookie Policy for PH Labs UK — How we use cookies and tracking technologies on our website.',
      metaKeywords: '',
      canonical: 'https://www.prohealthpeptides.co.uk/cookies',
      ogImage: '',
    },
  });

  // Load from Firestore
  useEffect(() => {
    (async () => {
      try {
        const globalSnap = await getDoc(doc(db, 'settings', 'seoGlobal'));
        if (globalSnap.exists()) setGlobalSEO(globalSnap.data() as GlobalSEO);

        const pagesSnap = await getDoc(doc(db, 'settings', 'seoPages'));
        if (pagesSnap.exists()) setPagesSEO(pagesSnap.data() as PagesSEO);

        // Prerender.io token is stored ONLY in localStorage (never Firestore — the
        // settings collection is publicly readable). Load from local device only.
        const localToken = localStorage.getItem('php_prerender_token') || '';
        if (localToken) {
          setPrerenderToken(localToken);
        }

      } catch (e) {
        console.error('Failed to load SEO settings:', e);
      }
    })();
  }, []);

  // Load product slugs when Prerender tab is opened
  const loadProductSlugs = async () => {
    setSlugsLoading(true);
    try {
      const snap = await getDocs(collection(db, 'product_stock'));
      const slugs = snap.docs
        .filter(d => d.data().active !== false)
        .map(d => (d.data().slug as string) || d.id)
        .filter(Boolean);
      setProductSlugs(slugs);
    } catch (e) {
      console.error('Failed to load product slugs:', e);
    } finally {
      setSlugsLoading(false);
    }
  };

  useEffect(() => {
    if (subTab === 'prerender' && productSlugs.length === 0) {
      loadProductSlugs();
    }
  }, [subTab]);

  // Save
  const handleSave = async () => {
    setSaving(true);
    setMsg(null);
    try {
      if (subTab === 'global') {
        await setDoc(doc(db, 'settings', 'seoGlobal'), globalSEO);
      } else if (subTab === 'pages') {
        await setDoc(doc(db, 'settings', 'seoPages'), pagesSEO);
      }
      setMsg({ type: 'success', text: 'SEO settings saved successfully' });
      setTimeout(() => setMsg(null), 3000);
    } catch (e) {
      setMsg({ type: 'error', text: 'Failed to save SEO settings' });
    } finally {
      setSaving(false);
    }
  };

  const charCount = (str: string, max: number) => {
    const len = str.length;
    const color = len > max ? 'text-red-400' : len > max * 0.9 ? 'text-amber-400' : 'text-[#5a80a6]';
    return <span className={`text-xs ${color}`}>{len}/{max}</span>;
  };

  const renderGooglePreview = (title: string, url: string, desc: string) => (
    <div className="mt-3 p-4 bg-white/[0.02] border border-white/[0.06] rounded-xl">
      <div className="flex items-center gap-2 mb-2">
        <Eye className="w-3.5 h-3.5 text-blue-400" />
        <p className="text-xs font-semibold text-blue-400">Google Search Preview</p>
      </div>
      <div className="space-y-1">
        <p className="text-xs text-green-600">{url}</p>
        <p className="text-lg text-blue-600 hover:underline cursor-pointer font-medium">{title || '(No title)'}</p>
        <p className="text-sm text-gray-700 leading-relaxed">{desc || '(No description)'}</p>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center">
            <Search className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-[#f0f6ff]">SEO Settings</h2>
            <p className="text-sm text-[#5a80a6]">Optimize meta tags, titles, and Open Graph data</p>
          </div>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm font-semibold transition-colors"
        >
          {saving ? <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}><Save className="w-4 h-4" /></motion.div> : <Save className="w-4 h-4" />}
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>

      {/* Status message */}
      <div aria-live="polite" aria-atomic="true">
        <AnimatePresence>
          {msg && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              role={msg.type === 'error' ? 'alert' : 'status'}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl border text-sm ${
                msg.type === 'success'
                  ? 'bg-green-500/10 border-green-500/30 text-green-300'
                  : 'bg-red-500/10 border-red-500/30 text-red-300'
              }`}
            >
              {msg.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
              {msg.text}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Sub-tabs */}
      <div className="flex gap-2 border-b border-white/[0.08] pb-3 overflow-x-auto scrollbar-none">
        {[
        { id: 'global', label: 'Global SEO', icon: Globe },
          { id: 'pages', label: 'Pages', icon: FileText },
          { id: 'products', label: 'Products', icon: Package },
          { id: 'resources', label: 'Resources', icon: BookOpen },
          { id: 'prerender', label: 'Prerender.io', icon: Zap },
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setSubTab(t.id as SubTab)}
            className={`shrink-0 flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
              subTab === t.id
                ? 'bg-white/[0.08] text-[#f0f6ff] border border-white/10'
                : 'text-[#5a80a6] hover:text-[#8caad4] hover:bg-white/[0.03]'
            }`}
          >
            <t.icon className="w-4 h-4" />
            {t.label}
          </button>
        ))}
      </div>

      {/* Global SEO */}
      {subTab === 'global' && (
        <div className="space-y-5">
          <div className="p-5 bg-white/[0.02] border border-white/[0.06] rounded-xl space-y-4">
            <div className="flex items-center gap-2 mb-3">
              <Globe className="w-4 h-4 text-green-400" />
              <h3 className="text-sm font-bold text-[#f0f6ff]">Global Defaults</h3>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#8caad4] mb-1.5">Default Title Suffix</label>
              <input
                type="text"
                value={globalSEO.defaultTitleSuffix}
                onChange={e => setGlobalSEO({ ...globalSEO, defaultTitleSuffix: e.target.value })}
                placeholder="| PH Labs"
                className="w-full px-4 py-3 bg-[#1e293b] border-2 border-[#475569] rounded-lg text-[#f8fafc] text-base placeholder-[#94a3b8] focus:outline-none focus:border-[#3b82f6] focus:shadow-[0_0_0_3px_rgba(59,130,246,0.3)] transition-all min-h-[48px]"
              />
              <p className="text-xs text-[#5a80a6] mt-1">Appended to all page titles (e.g., "Contact | PH Labs")</p>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-semibold text-[#8caad4]">Default Meta Description</label>
                {charCount(globalSEO.defaultMetaDescription, 160)}
              </div>
              <textarea
                value={globalSEO.defaultMetaDescription}
                onChange={e => setGlobalSEO({ ...globalSEO, defaultMetaDescription: e.target.value })}
                rows={3}
                placeholder="Fallback meta description for pages without custom SEO..."
                className="w-full px-4 py-3 bg-[#1e293b] border-2 border-[#475569] rounded-lg text-[#f8fafc] text-base placeholder-[#94a3b8] focus:outline-none focus:border-[#3b82f6] focus:shadow-[0_0_0_3px_rgba(59,130,246,0.3)] transition-all resize-none min-h-[120px]"
              />
              <p className="text-xs text-[#5a80a6] mt-1">Used as fallback when page-specific description is missing</p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#8caad4] mb-1.5">Site-wide OG Image URL</label>
              <div className="flex gap-2">
                <input
                  type="url"
                  value={globalSEO.siteOGImage}
                  onChange={e => setGlobalSEO({ ...globalSEO, siteOGImage: e.target.value })}
                  placeholder="https://..."
                  className="flex-1 px-4 py-3 bg-[#1e293b] border-2 border-[#475569] rounded-lg text-[#f8fafc] text-base placeholder-[#94a3b8] focus:outline-none focus:border-[#3b82f6] focus:shadow-[0_0_0_3px_rgba(59,130,246,0.3)] transition-all min-h-[48px]"
                />
                <button className="px-4 py-2 bg-white/[0.04] border border-white/10 rounded-xl text-sm text-[#8caad4] hover:text-white hover:border-green-500/30 transition-colors flex items-center gap-2">
                  <ImageIcon className="w-4 h-4" />
                  Upload
                </button>
              </div>
              <p className="text-xs text-[#5a80a6] mt-1">Default image for social shares (1200×630px recommended)</p>
            </div>
          </div>
        </div>
      )}

      {/* Pages SEO */}
      {subTab === 'pages' && (
        <div className="space-y-5">
          {(Object.keys(pagesSEO) as Array<keyof PagesSEO>).map(pageKey => {
            const page = pagesSEO[pageKey];
            const pageLabels: Record<keyof PagesSEO, string> = {
              home: 'Homepage',
              about: 'About',
              contact: 'Contact',
              terms: 'Terms of Service',
              privacy: 'Privacy Policy',
              cookies: 'Cookie Policy',
            };
            return (
              <div key={pageKey} className="p-5 bg-white/[0.02] border border-white/[0.06] rounded-xl space-y-4">
                <div className="flex items-center gap-2 mb-3">
                  <FileText className="w-4 h-4 text-blue-400" />
                  <h3 className="text-sm font-bold text-[#f0f6ff]">{pageLabels[pageKey]}</h3>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-semibold text-[#8caad4]">Page Title</label>
                    {charCount(page.title, 60)}
                  </div>
                  <input
                    type="text"
                    value={page.title}
                    onChange={e => setPagesSEO({ ...pagesSEO, [pageKey]: { ...page, title: e.target.value } })}
                    placeholder="Page Title | PH Labs"
                    className="w-full px-4 py-3 bg-[#1e293b] border-2 border-[#475569] rounded-lg text-[#f8fafc] text-base placeholder-[#94a3b8] focus:outline-none focus:border-[#3b82f6] focus:shadow-[0_0_0_3px_rgba(59,130,246,0.3)] transition-all min-h-[48px]"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-semibold text-[#8caad4]">Meta Description</label>
                    {charCount(page.metaDescription, 160)}
                  </div>
                  <textarea
                    value={page.metaDescription}
                    onChange={e => setPagesSEO({ ...pagesSEO, [pageKey]: { ...page, metaDescription: e.target.value } })}
                    rows={2}
                    placeholder="Concise page description (150-160 characters)..."
                    className="w-full px-4 py-3 bg-[#1e293b] border-2 border-[#475569] rounded-lg text-[#f8fafc] text-base placeholder-[#94a3b8] focus:outline-none focus:border-[#3b82f6] focus:shadow-[0_0_0_3px_rgba(59,130,246,0.3)] transition-all resize-none min-h-[120px]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#8caad4] mb-1.5">Meta Keywords (optional)</label>
                  <input
                    type="text"
                    value={page.metaKeywords || ''}
                    onChange={e => setPagesSEO({ ...pagesSEO, [pageKey]: { ...page, metaKeywords: e.target.value } })}
                    placeholder="peptides, research, UK, HPLC..."
                    className="w-full bg-white border border-gray-300 text-gray-900 text-[16px] placeholder-gray-500 py-2.5 px-4 rounded-xl focus:outline-none focus:border-green-500 focus:ring-2 focus:ring-green-100 transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#8caad4] mb-1.5">Canonical URL (optional)</label>
                  <input
                    type="url"
                    value={page.canonical || ''}
                    onChange={e => setPagesSEO({ ...pagesSEO, [pageKey]: { ...page, canonical: e.target.value } })}
                    placeholder="https://www.prohealthpeptides.co.uk/..."
                    className="w-full bg-white border border-gray-300 text-gray-900 text-[16px] placeholder-gray-500 py-2.5 px-4 rounded-xl focus:outline-none focus:border-green-500 focus:ring-2 focus:ring-green-100 transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#8caad4] mb-1.5">OG Image URL (optional)</label>
                  <div className="flex gap-2">
                    <input
                      type="url"
                      value={page.ogImage || ''}
                      onChange={e => setPagesSEO({ ...pagesSEO, [pageKey]: { ...page, ogImage: e.target.value } })}
                      placeholder="https://..."
                      className="flex-1 px-4 py-3 bg-[#1e293b] border-2 border-[#475569] rounded-lg text-[#f8fafc] text-base placeholder-[#94a3b8] focus:outline-none focus:border-[#3b82f6] focus:shadow-[0_0_0_3px_rgba(59,130,246,0.3)] transition-all min-h-[48px]"
                    />
                    <button className="px-4 py-2 bg-white/[0.04] border border-white/10 rounded-xl text-sm text-[#8caad4] hover:text-white hover:border-green-500/30 transition-colors flex items-center gap-2">
                      <ImageIcon className="w-4 h-4" />
                      Upload
                    </button>
                  </div>
                </div>

                {renderGooglePreview(page.title, page.canonical || 'https://www.prohealthpeptides.co.uk/', page.metaDescription)}
              </div>
            );
          })}
        </div>
      )}

      {/* Products & Resources (placeholder) */}
      {(subTab === 'products' || subTab === 'resources') && (
        <div className="p-8 bg-white/[0.02] border border-white/[0.06] rounded-xl text-center">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center mx-auto mb-3">
            {subTab === 'products' ? <Package className="w-6 h-6 text-white" /> : <BookOpen className="w-6 h-6 text-white" />}
          </div>
          <h3 className="text-lg font-bold text-[#f0f6ff] mb-2">
            {subTab === 'products' ? 'Product SEO' : 'Resource SEO'}
          </h3>
          <p className="text-sm text-[#5a80a6]">
            {subTab === 'products'
              ? 'Per-product SEO fields will be added to the existing product edit form in Inventory.'
              : 'Per-article SEO fields will be integrated into the Resources/Articles editor.'}
          </p>
        </div>
      )}

      {/* ── Prerender.io ─────────────────────────────────────────────────────── */}
      {subTab === 'prerender' && (
        <div className="space-y-5">

          {/* Status bar — last recache badge */}
          <div className="flex items-center justify-between px-4 py-3 bg-white/[0.02] border border-white/[0.06] rounded-xl">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-400 shrink-0" />
              <span className="text-sm font-semibold text-[#f0f6ff]">Prerender.io Cache Manager</span>
            </div>
            {lastRecacheTs ? (
              <div className="flex items-center gap-1.5 px-3 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-full">
                <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
                <span className="text-xs text-emerald-300 font-medium">
                  Last recache: {new Date(lastRecacheTs).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 px-3 py-1 bg-amber-500/10 border border-amber-500/20 rounded-full">
                <Clock className="w-3 h-3 text-amber-400 shrink-0" />
                <span className="text-xs text-amber-300 font-medium">Never recached</span>
              </div>
            )}
          </div>

          {/* Token */}
          <div className="p-5 bg-white/[0.02] border border-white/[0.06] rounded-xl space-y-4">
            <div className="flex items-center gap-2 mb-1">
              <Key className="w-4 h-4 text-amber-400" />
              <h3 className="text-sm font-bold text-[#f0f6ff]">API Token</h3>
            </div>
            <p className="text-xs text-[#5a80a6]">Your Prerender.io token — found under Security &amp; Access in your dashboard. Saved securely to Firestore, never exposed publicly.</p>
            <div className="flex gap-2">
              <input
                type="password"
                value={prerenderToken}
                onChange={e => setPrerenderToken(e.target.value)}
                placeholder="Paste your Prerender.io token"
                className="flex-1 bg-white border border-gray-300 text-gray-900 text-[16px] placeholder-gray-500 py-3 px-4 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all font-mono text-sm"
              />
              <button
                onClick={saveToken}
                disabled={tokenSaving || !prerenderToken.trim()}
                className="flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white text-sm font-semibold rounded-xl transition-colors shrink-0"
              >
                {tokenSaving ? <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}><Save className="w-4 h-4" /></motion.div> : tokenSaved ? <CheckCircle2 className="w-4 h-4" /> : <Save className="w-4 h-4" />}
                {tokenSaving ? 'Saving…' : tokenSaved ? 'Saved!' : 'Save Token'}
              </button>
            </div>
          </div>

          {/* Actions */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

            {/* Recache Desktop */}
            <div className="p-5 bg-white/[0.02] border border-white/[0.06] rounded-xl space-y-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center shrink-0">
                  <RefreshCw className="w-4 h-4 text-white" />
                </div>
                <div>
                  <p className="text-sm font-bold text-[#f0f6ff]">Recache All Pages</p>
                  <p className="text-xs text-[#5a80a6]">{KEY_URLS.length} core + {slugsLoading ? '…' : productSlugs.length} products · desktop</p>
                </div>
              </div>
              <p className="text-xs text-[#5a80a6] leading-relaxed">Refreshes every key page and all product pages. Run after publishing changes.</p>
              <button
                onClick={handleRecacheAll}
                disabled={recaching || submittingSitemap || !prerenderToken.trim() || slugsLoading}
                className="w-full flex items-center justify-center gap-2 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold rounded-xl transition-colors"
              >
                {recaching ? <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}><RefreshCw className="w-4 h-4" /></motion.div> : <RefreshCw className="w-4 h-4" />}
                {recaching ? 'Recaching…' : `Recache Desktop (${KEY_URLS.length + productSlugs.length})`}
              </button>
            </div>

            {/* Recache Mobile */}
            <div className="p-5 bg-white/[0.02] border border-white/[0.06] rounded-xl space-y-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-purple-700 flex items-center justify-center shrink-0">
                  <RefreshCw className="w-4 h-4 text-white" />
                </div>
                <div>
                  <p className="text-sm font-bold text-[#f0f6ff]">Recache Mobile</p>
                  <p className="text-xs text-[#5a80a6]">{KEY_URLS.length} core + {slugsLoading ? '…' : productSlugs.length} products · mobile</p>
                </div>
              </div>
              <p className="text-xs text-[#5a80a6] leading-relaxed">Same pages with <code className="text-purple-400">adaptiveType: mobile</code> — refreshes Google's mobile-first index cache.</p>
              <button
                onClick={handleRecacheMobile}
                disabled={recaching || submittingSitemap || !prerenderToken.trim() || slugsLoading}
                className="w-full flex items-center justify-center gap-2 py-2.5 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-sm font-semibold rounded-xl transition-colors"
              >
                {recaching ? <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}><RefreshCw className="w-4 h-4" /></motion.div> : <RefreshCw className="w-4 h-4" />}
                {recaching ? 'Recaching…' : `Recache Mobile (${KEY_URLS.length + productSlugs.length})`}
              </button>
            </div>

            {/* Recache Products Only */}
            <div className="p-5 bg-white/[0.02] border border-white/[0.06] rounded-xl space-y-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shrink-0">
                  <Package className="w-4 h-4 text-white" />
                </div>
                <div>
                  <p className="text-sm font-bold text-[#f0f6ff]">Recache Products Only</p>
                  <p className="text-xs text-[#5a80a6]">{slugsLoading ? 'Loading…' : `${productSlugs.length} product pages`} · desktop</p>
                </div>
              </div>
              <p className="text-xs text-[#5a80a6] leading-relaxed">Refreshes only product pages. Use after editing product content, prices or adding new stock.</p>
              <button
                onClick={handleRecacheProductsOnly}
                disabled={recaching || !prerenderToken.trim() || slugsLoading || productSlugs.length === 0}
                className="w-full flex items-center justify-center gap-2 py-2.5 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white text-sm font-semibold rounded-xl transition-colors"
              >
                {recaching ? <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}><RefreshCw className="w-4 h-4" /></motion.div> : <Zap className="w-4 h-4" />}
                {recaching ? 'Recaching…' : `Recache ${productSlugs.length} Products`}
              </button>
            </div>

            {/* Submit Sitemap */}
            <div className="p-5 bg-white/[0.02] border border-white/[0.06] rounded-xl space-y-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500 to-green-700 flex items-center justify-center shrink-0">
                  <Map className="w-4 h-4 text-white" />
                </div>
                <div>
                  <p className="text-sm font-bold text-[#f0f6ff]">Submit Sitemap</p>
                  <p className="text-xs text-[#5a80a6]">Cache new URLs only</p>
                </div>
              </div>
              <p className="text-xs text-[#5a80a6] leading-relaxed">Submits <span className="text-emerald-400 font-mono text-[10px]">sitemap.xml</span> to Prerender.io. Caches any URLs not yet in the cache. Does not recache existing pages.</p>
              <button
                onClick={handleSubmitSitemap}
                disabled={recaching || submittingSitemap || !prerenderToken.trim()}
                className="w-full flex items-center justify-center gap-2 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-semibold rounded-xl transition-colors"
              >
                {submittingSitemap ? <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}><Map className="w-4 h-4" /></motion.div> : <Map className="w-4 h-4" />}
                {submittingSitemap ? 'Submitting…' : 'Submit Sitemap'}
              </button>
            </div>

            {/* Cache Clear */}
            <div className="p-5 bg-white/[0.02] border border-red-500/10 rounded-xl space-y-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-red-500 to-red-700 flex items-center justify-center shrink-0">
                  <Trash2 className="w-4 h-4 text-white" />
                </div>
                <div>
                  <p className="text-sm font-bold text-[#f0f6ff]">Cache Clear</p>
                  <p className="text-xs text-red-400/70">Removes all cached pages</p>
                </div>
              </div>
              <p className="text-xs text-[#5a80a6] leading-relaxed">Clears the entire Prerender.io cache for this domain. Pages will be re-rendered fresh on next request. Use after major site changes.</p>
              <button
                onClick={handleCacheClear}
                disabled={recaching || submittingSitemap || clearingCache || !prerenderToken.trim()}
                className="w-full flex items-center justify-center gap-2 py-2.5 bg-red-700/70 hover:bg-red-700 disabled:opacity-50 text-white text-sm font-semibold rounded-xl transition-colors border border-red-500/20"
              >
                {clearingCache ? <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}><Trash2 className="w-4 h-4" /></motion.div> : <Trash2 className="w-4 h-4" />}
                {clearingCache ? 'Clearing…' : 'Clear Entire Cache'}
              </button>
            </div>
          </div>

          {/* Cache Search + Change Speed */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

            {/* Cache Search */}
            <div className="p-5 bg-white/[0.02] border border-white/[0.06] rounded-xl space-y-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-600 flex items-center justify-center shrink-0">
                  <SearchCode className="w-4 h-4 text-white" />
                </div>
                <div>
                  <p className="text-sm font-bold text-[#f0f6ff]">Cache Search</p>
                  <p className="text-xs text-[#5a80a6]">Check if a page is cached</p>
                </div>
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => { setSearchQuery(e.target.value); setSearchResults(null); setSearchError(''); }}
                  onKeyDown={e => e.key === 'Enter' && handleCacheSearch()}
                  placeholder="/products/bpc-157 or full URL"
                  className="flex-1 min-w-0 bg-white border border-gray-300 text-gray-900 text-sm placeholder-gray-500 py-2 px-3 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all"
                />
                <button
                  onClick={handleCacheSearch}
                  disabled={searching || !prerenderToken.trim()}
                  className="shrink-0 flex items-center gap-1.5 px-3 py-2 bg-blue-600/80 hover:bg-blue-600 disabled:opacity-50 text-white text-xs font-semibold rounded-xl transition-colors"
                >
                  {searching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                  Search
                </button>
              </div>
              {searchError && <p className="text-xs text-red-400">{searchError}</p>}
              {searchResults !== null && searchResults.length > 0 && (
                <div className="space-y-1 max-h-36 overflow-y-auto">
                  {searchResults.map((r, i) => (
                    <div key={i} className="flex items-center gap-2 py-1.5 px-3 bg-emerald-500/10 border border-emerald-500/15 rounded-lg">
                      <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
                      <span className="text-xs text-emerald-300 truncate flex-1">{typeof r === 'string' ? r : (r.url || JSON.stringify(r))}</span>
                      {r.adaptiveType && <span className="text-[10px] text-emerald-500 shrink-0">{r.adaptiveType}</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Change Recache Speed */}
            <div className="p-5 bg-white/[0.02] border border-white/[0.06] rounded-xl space-y-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-violet-700 flex items-center justify-center shrink-0">
                  <Gauge className="w-4 h-4 text-white" />
                </div>
                <div>
                  <p className="text-sm font-bold text-[#f0f6ff]">Recache Speed</p>
                  <p className="text-xs text-[#5a80a6]">URLs per hour</p>
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-[#5a80a6]">Speed</span>
                  <span className="text-xs font-semibold text-[#f0f6ff]">
                    {speedValue === 0 ? 'Auto' : `${speedValue.toLocaleString()} URLs/hr`}
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={36000}
                  step={3600}
                  value={speedValue}
                  onChange={e => { setSpeedValue(Number(e.target.value)); setSpeedResult(null); }}
                  className="w-full accent-purple-500"
                />
                <div className="flex justify-between text-[10px] text-[#3a5a82]">
                  <span>Auto</span><span>3,600</span><span>18,000</span><span>36,000</span>
                </div>
              </div>
              {speedResult && (
                <div className="text-xs text-purple-300 bg-purple-500/10 border border-purple-500/15 rounded-lg px-3 py-2">
                  {speedResult.isAutomaticDelay ? 'Automatic delay active' : `~${speedResult.num1Hour?.toLocaleString()} pages/hr · ${speedResult.num1Day?.toLocaleString()} pages/day`}
                </div>
              )}
              <button
                onClick={handleChangeSpeed}
                disabled={settingSpeed || !prerenderToken.trim()}
                className="w-full flex items-center justify-center gap-2 py-2 bg-purple-700/70 hover:bg-purple-700 disabled:opacity-50 text-white text-xs font-semibold rounded-xl transition-colors border border-purple-500/20"
              >
                {settingSpeed ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Gauge className="w-3.5 h-3.5" />}
                {settingSpeed ? 'Applying…' : 'Apply Speed'}
              </button>
            </div>

            {/* Cache Status */}
            <div className="p-5 bg-white/[0.02] border border-white/[0.06] rounded-xl space-y-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-teal-500 to-cyan-700 flex items-center justify-center shrink-0">
                  <Eye className="w-4 h-4 text-white" />
                </div>
                <div>
                  <p className="text-sm font-bold text-[#f0f6ff]">Cache Status</p>
                  <p className="text-xs text-[#5a80a6]">Pages in Prerender cache</p>
                </div>
              </div>
              {cacheStatusCount !== null && (
                <div className="flex items-center justify-center py-3">
                  <div className="text-center">
                    <span className="text-3xl font-bold text-teal-400">{cacheStatusCount.toLocaleString()}</span>
                    <p className="text-xs text-[#5a80a6] mt-1">pages cached</p>
                  </div>
                </div>
              )}
              {cacheStatusError && (
                <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 p-3 space-y-2">
                  <p className="text-xs text-amber-300 font-semibold">Prerender.io API requires a server — cannot call directly from browser.</p>
                  <p className="text-xs text-[#5a80a6]">Check your cache count and status directly in the Prerender.io dashboard:</p>
                  <a
                    href="https://dashboard.prerender.io"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs text-teal-400 hover:text-teal-300 underline underline-offset-2 transition-colors"
                  >
                    <Globe className="w-3 h-3" />
                    dashboard.prerender.io
                  </a>
                </div>
              )}
              <button
                onClick={handleCacheStatus}
                disabled={loadingCacheStatus || !prerenderToken.trim()}
                className="w-full flex items-center justify-center gap-2 py-2 bg-teal-700/70 hover:bg-teal-700 disabled:opacity-50 text-white text-xs font-semibold rounded-xl transition-colors border border-teal-500/20"
              >
                {loadingCacheStatus ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Eye className="w-3.5 h-3.5" />}
                {loadingCacheStatus ? 'Counting…' : 'Check Status'}
              </button>
              <a
                href="https://dashboard.prerender.io"
                target="_blank"
                rel="noopener noreferrer"
                className="w-full flex items-center justify-center gap-2 py-2 bg-white/[0.04] hover:bg-white/[0.07] text-[#9cb8d9] hover:text-white text-xs font-semibold rounded-xl transition-colors border border-white/[0.06]"
              >
                <Globe className="w-3.5 h-3.5" />
                Open Prerender Dashboard
              </a>
            </div>
          </div>

          {/* URL list */}
          <div className="p-5 bg-white/[0.02] border border-white/[0.06] rounded-xl space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Globe className="w-4 h-4 text-blue-400" />
                <h3 className="text-sm font-bold text-[#f0f6ff]">Pages Included in Recache</h3>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-[#5a80a6] bg-white/[0.04] px-2 py-0.5 rounded-full">
                  {KEY_URLS.length + productSlugs.length} URLs total
                </span>
                <button
                  onClick={loadProductSlugs}
                  disabled={slugsLoading}
                  className="flex items-center gap-1.5 text-xs text-[#5a80a6] hover:text-blue-400 transition-colors disabled:opacity-50"
                  title="Refresh product list from Firebase"
                >
                  {slugsLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                  Refresh
                </button>
              </div>
            </div>

            {/* Core pages */}
            <div>
              <p className="text-[10px] font-semibold text-[#3a5a82] uppercase tracking-widest mb-1.5">Core Pages ({KEY_URLS.length})</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                {KEY_URLS.map(url => (
                  <a key={url} href={url} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-xs text-[#5a80a6] hover:text-blue-400 transition-colors group py-0.5">
                    <ExternalLink className="w-3 h-3 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                    {url.replace('https://www.prohealthpeptides.co.uk', '') || '/'}
                  </a>
                ))}
              </div>
            </div>

            {/* Product pages */}
            <div>
              <p className="text-[10px] font-semibold text-[#3a5a82] uppercase tracking-widest mb-1.5">
                Product Pages ({slugsLoading ? '…' : productSlugs.length})
              </p>
              {slugsLoading ? (
                <div className="flex items-center gap-2 text-xs text-[#3a5a82]">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading product slugs from Firebase…
                </div>
              ) : productSlugs.length === 0 ? (
                <p className="text-xs text-[#3a5a82]">No products found — check Firebase connection</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 max-h-48 overflow-y-auto">
                  {productSlugs.map(slug => (
                    <a key={slug} href={`${BASE}/products/${slug}`} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-1.5 text-xs text-[#5a80a6] hover:text-emerald-400 transition-colors group py-0.5">
                      <ExternalLink className="w-3 h-3 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                      /products/{slug}
                    </a>
                  ))}
                </div>
              )}
            </div>
            <p className="text-xs text-[#3a5a82] pt-1 border-t border-white/[0.04]">Product slugs are fetched live from Firebase each time you open this tab. Click Refresh to reload after adding new products.</p>
          </div>

          {/* Activity log */}
          {prerenderLog.length > 0 && (
            <div className="p-5 bg-white/[0.02] border border-white/[0.06] rounded-xl space-y-2">
              <div className="flex items-center justify-between mb-1">
                <h3 className="text-sm font-bold text-[#f0f6ff]">Activity Log</h3>
                <button onClick={() => setPrerenderLog([])} className="text-xs text-[#3a5a82] hover:text-[#5a80a6] transition-colors">Clear</button>
              </div>
              <div className="space-y-1 max-h-64 overflow-y-auto">
                {prerenderLog.map((entry, i) => (
                  <div key={i} className={`text-xs py-2 px-3 rounded-lg ${
                    entry.type === 'success' ? 'bg-green-500/10 text-green-300' :
                    entry.type === 'error' ? 'bg-red-500/10 text-red-300' :
                    'bg-blue-500/10 text-blue-300'
                  }`}>
                    <div className="flex items-start gap-2">
                      <span className="shrink-0 opacity-60 font-mono">{entry.ts}</span>
                      {entry.text.startsWith('Run manually') ? (
                        <div className="flex-1 space-y-1.5">
                          <span className="text-amber-300 font-semibold">Prerender.io API requires server-side call. Run this command in your terminal:</span>
                          <div className="relative">
                            <pre className="bg-black/40 rounded-lg p-2.5 text-[10px] text-green-300 font-mono whitespace-pre-wrap break-all border border-white/[0.06] leading-relaxed">{entry.text.replace('Run manually in terminal:\n', '').replace('Run manually:\n', '')}</pre>
                            <button
                              onClick={() => navigator.clipboard.writeText(entry.text.replace('Run manually in terminal:\n', '').replace('Run manually:\n', ''))}
                              className="absolute top-1.5 right-1.5 text-[10px] px-2 py-0.5 bg-white/10 hover:bg-white/20 rounded text-white/70 hover:text-white transition-colors"
                            >Copy</button>
                          </div>
                        </div>
                      ) : (
                        <span className="flex-1 break-words">{entry.text}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Manual curl commands panel */}
          {prerenderToken.trim() && (
            <div className="p-5 bg-white/[0.02] border border-white/[0.06] rounded-xl space-y-3">
              <h3 className="text-sm font-bold text-[#f0f6ff] flex items-center gap-2">
                <span className="text-base">💻</span> Manual Commands
              </h3>
              <p className="text-xs text-[#5a80a6]">If browser calls fail due to CORS, run these in your terminal or a cron job:</p>
              {[
                {
                  label: 'Submit Sitemap',
                  cmd: `curl -s -X POST https://api.prerender.io/sitemap \\\n  -H "Content-Type: application/json" \\\n  -d '{"prerenderToken":"${prerenderToken.trim()}","url":"${SITEMAP_URL}"}'`,
                },
                {
                  label: 'Recache All Pages',
                  cmd: `curl -s -X POST https://api.prerender.io/recache \\\n  -H "Content-Type: application/json" \\\n  -d '{"prerenderToken":"${prerenderToken.trim()}","urls":["https://www.prohealthpeptides.co.uk/","https://www.prohealthpeptides.co.uk/products","https://www.prohealthpeptides.co.uk/research"]}'`,
                },
                {
                  label: 'Clear Full Cache',
                  cmd: `curl -s -X POST https://api.prerender.io/cache-clear \\\n  -H "Content-Type: application/json" \\\n  -d '{"prerenderToken":"${prerenderToken.trim()}","query":"https://www.prohealthpeptides.co.uk%"}'`,
                },
              ].map(({ label, cmd }) => (
                <div key={label} className="space-y-1">
                  <p className="text-[10px] font-semibold text-[#3a5a82] uppercase tracking-widest">{label}</p>
                  <div className="relative">
                    <pre className="bg-black/40 rounded-lg p-2.5 text-[10px] text-green-300 font-mono whitespace-pre-wrap break-all border border-white/[0.06] leading-relaxed">{cmd}</pre>
                    <button
                      onClick={() => navigator.clipboard.writeText(cmd.replace(/\\\n {2}/g, ' '))}
                      className="absolute top-1.5 right-1.5 text-[10px] px-2 py-0.5 bg-white/10 hover:bg-white/20 rounded text-white/70 hover:text-white transition-colors"
                    >Copy</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
