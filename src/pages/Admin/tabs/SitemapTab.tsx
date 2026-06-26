import { useState, useEffect } from 'react';
import { db, doc, setDoc, updateProduct, getAllProducts } from '@/lib/firebase';
import type { Product } from '@/lib/firebase';
import { Map, RefreshCw, Globe, CheckCircle2, XCircle, AlertCircle, ExternalLink, Copy, Loader2, ToggleLeft, ToggleRight, ChevronDown, ChevronUp } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const BASE = 'https://phlabs.co.uk';
const SITEMAP_URL = `${BASE}/sitemap.xml`;

const STATIC_PAGES = [
  { path: '/', label: 'Homepage', priority: '1.0', changefreq: 'weekly' },
  { path: '/products', label: 'Products', priority: '0.9', changefreq: 'daily' },
  { path: '/lab-reports', label: 'Lab Reports', priority: '0.8', changefreq: 'monthly' },
  { path: '/research', label: 'Research', priority: '0.8', changefreq: 'weekly' },
  { path: '/resources', label: 'Resources', priority: '0.7', changefreq: 'weekly' },
  { path: '/about', label: 'About', priority: '0.6', changefreq: 'monthly' },
  { path: '/contact', label: 'Contact', priority: '0.6', changefreq: 'monthly' },
  { path: '/storage-guide', label: 'Storage Guide', priority: '0.6', changefreq: 'monthly' },
  { path: '/search', label: 'Search', priority: '0.4', changefreq: 'daily' },
  { path: '/refund-policy', label: 'Refund Policy', priority: '0.3', changefreq: 'yearly' },
  { path: '/shipping-policy', label: 'Shipping Policy', priority: '0.3', changefreq: 'yearly' },
  { path: '/privacy-policy', label: 'Privacy Policy', priority: '0.3', changefreq: 'yearly' },
  { path: '/terms-and-conditions', label: 'Terms & Conditions', priority: '0.3', changefreq: 'yearly' },
  { path: '/cookies', label: 'Cookie Policy', priority: '0.3', changefreq: 'yearly' },
];

const PRODUCT_INDEX_NOTE = 'All active product URLs are listed as canonical 200 pages, including Glow Blend and Klow Blend. Retired legacy product slugs still redirect to /products.';

export default function SitemapTab() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [regenerating, setRegenerating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [log, setLog] = useState<{ type: 'success' | 'error' | 'info'; text: string; ts: string }[]>([]);
  const [showStaticPages, setShowStaticPages] = useState(false);
  const [copiedXml, setCopiedXml] = useState(false);

  const prerenderToken = localStorage.getItem('php_prerender_token') || '';

  const addLog = (type: 'success' | 'error' | 'info', text: string) => {
    const ts = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    setLog(prev => [{ type, text, ts }, ...prev].slice(0, 30));
  };

  useEffect(() => {
    loadProducts();
  }, []);

  const loadProducts = async () => {
    setLoading(true);
    try {
      const prods = await getAllProducts();
      prods.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      setProducts(prods);
      addLog('info', `Loaded ${prods.length} products from database`);
    } catch (e) {
      console.error('Failed to load products:', e);
      addLog('error', 'Failed to load products from database');
    } finally {
      setLoading(false);
    }
  };

  // Slug auto-generate from name
  const generateSlug = (name: string) =>
    name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  // Validate slug
  const validateSlug = (slug: string) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug);

  // Toggle product in/out of sitemap
  const toggleSitemap = async (product: Product) => {
    const newVal = !(product as any).excludeFromSitemap;
    setSaving(product.id);
    try {
      await updateProduct(product.id, { excludeFromSitemap: newVal } as any);
      setProducts(prev => prev.map(p => p.id === product.id ? { ...p, excludeFromSitemap: newVal } as any : p));
      addLog('success', `${product.name} ${newVal ? 'excluded from' : 'included in'} sitemap`);
    } catch {
      addLog('error', `Failed to update ${product.name}`);
    } finally {
      setSaving(null);
    }
  };

  // Save slug for a product
  const saveSlug = async (product: Product, slug: string) => {
    if (!validateSlug(slug)) {
      addLog('error', 'Invalid slug — use lowercase letters, numbers and hyphens only');
      return;
    }
    // Check duplicates
    const duplicate = products.find(p => p.id !== product.id && (p.slug || generateSlug(p.name)) === slug);
    if (duplicate) {
      addLog('error', `Slug "${slug}" is already used by "${duplicate.name}"`);
      return;
    }
    setSaving(product.id);
    try {
      await updateProduct(product.id, { slug });
      setProducts(prev => prev.map(p => p.id === product.id ? { ...p, slug } : p));
      addLog('success', `Slug saved: /products/${slug}`);
    } catch {
      addLog('error', `Failed to save slug for ${product.name}`);
    } finally {
      setSaving(null);
    }
  };

  // Build XML sitemap content
  const buildSitemapXml = () => {
    const now = new Date().toISOString().split('T')[0];
    const productUrls = products
      .filter(p => !(p as any).excludeFromSitemap && p.visibility !== 'hidden')
      .map(p => {
        const slug = p.slug || generateSlug(p.name);
        return `  <url>\n    <loc>${BASE}/products/${slug}</loc>\n    <lastmod>${now}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.8</priority>\n  </url>`;
      });
    const staticUrls = STATIC_PAGES.map(pg =>
      `  <url>\n    <loc>${BASE}${pg.path}</loc>\n    <lastmod>${now}</lastmod>\n    <changefreq>${pg.changefreq}</changefreq>\n    <priority>${pg.priority}</priority>\n  </url>`
    );
    return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${[...staticUrls, ...productUrls].join('\n')}\n</urlset>`;
  };

  const handleRegenerateSitemap = async () => {
    setRegenerating(true);
    addLog('info', 'Regenerating sitemap…');
    try {
      const xml = buildSitemapXml();
      // Save last regen timestamp to Firestore
      await setDoc(doc(db, 'settings', 'sitemap'), {
        lastGenerated: new Date().toISOString(),
        productCount: products.filter(p => !(p as any).excludeFromSitemap && p.visibility !== 'hidden').length,
        xml,
      }, { merge: true });
      addLog('success', `Sitemap regenerated — ${products.filter(p => !(p as any).excludeFromSitemap).length + STATIC_PAGES.length} URLs`);
      // Auto-ping IndexNow for sitemap.xml so Bing/Yandex re-fetch the index.
      try {
        const { submitToIndexNow } = await import('@/lib/indexnow.functions');
        submitToIndexNow({
          data: { urls: ['https://phlabs.co.uk/sitemap.xml', 'https://phlabs.co.uk/'] },
        }).then((r: any) => addLog('info', `IndexNow: ${r?.message || 'submitted'}`)).catch(() => {});
      } catch { /* best-effort */ }
      setMsg({ type: 'success', text: 'Sitemap regenerated successfully!' });
      setTimeout(() => setMsg(null), 3000);
    } catch (e) {
      addLog('error', 'Failed to save sitemap data');
    } finally {
      setRegenerating(false);
    }
  };

  const handleSubmitToPrerender = async () => {
    if (!prerenderToken) {
      addLog('error', 'No Prerender.io token — set it in SEO → Prerender.io tab first');
      return;
    }
    setSubmitting(true);
    addLog('info', `Submitting sitemap to Prerender.io: ${SITEMAP_URL}`);
    try {
      const res = await fetch(`https://api.prerender.io/sitemap`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prerenderToken, url: SITEMAP_URL }),
      });
      if (res.ok) {
        addLog('success', '✓ Sitemap submitted to Prerender.io — new URLs will be cached');
      } else {
        addLog('error', `Prerender.io submission failed (${res.status})`);
      }
    } catch {
      addLog('info', `CORS blocked — run manually:\ncurl -X POST https://api.prerender.io/sitemap -H "Content-Type: application/json" -d '{"prerenderToken":"${prerenderToken}","url":"${SITEMAP_URL}"}'`);
    } finally {
      setSubmitting(false);
    }
  };

  const copyXml = () => {
    navigator.clipboard.writeText(buildSitemapXml());
    setCopiedXml(true);
    setTimeout(() => setCopiedXml(false), 2000);
  };

  const includedCount = products.filter(p => !(p as any).excludeFromSitemap && p.visibility !== 'hidden').length;

  return (
    <div className="p-4 sm:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Map className="w-5 h-5 text-blue-400" />
            Sitemap Manager
          </h2>
          <p className="text-sm text-[#9cb8d9] mt-1">
            {loading ? 'Loading…' : `${includedCount} products + ${STATIC_PAGES.length} pages indexed`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={handleRegenerateSitemap}
            disabled={regenerating || loading}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
          >
            {regenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Regenerate Sitemap
          </button>
          <button
            onClick={handleSubmitToPrerender}
            disabled={submitting}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Globe className="w-4 h-4" />}
            Submit to Prerender.io
          </button>
          <a
            href={SITEMAP_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-4 py-2 bg-[#0b1a30] hover:bg-[#1a3a5c] text-[#9cb8d9] hover:text-white border border-white/10 rounded-lg text-sm font-medium transition-colors"
          >
            <ExternalLink className="w-4 h-4" />
            View Live
          </a>
        </div>
      </div>

      {/* Status message */}
      <AnimatePresence>
        {msg && (
          <motion.div
            initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className={`flex items-center gap-2 px-4 py-3 rounded-lg text-sm font-medium ${
              msg.type === 'success' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
              msg.type === 'error' ? 'bg-red-500/10 text-red-400 border border-red-500/20' :
              'bg-blue-500/10 text-blue-400 border border-blue-500/20'
            }`}
          >
            {msg.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
            {msg.text}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-5 py-4">
        <p className="text-sm text-emerald-300 font-medium">Canonical product index</p>
        <p className="text-xs text-[#9cb8d9] mt-1">{PRODUCT_INDEX_NOTE}</p>
      </div>

      {/* Static pages toggle */}
      <div className="bg-[#0b1a30]/70 border border-white/[0.07] rounded-xl overflow-hidden">
        <button
          onClick={() => setShowStaticPages(!showStaticPages)}
          className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-white/[0.02] transition-colors"
        >
          <div className="flex items-center gap-3">
            <Globe className="w-4 h-4 text-blue-400" />
            <span className="text-white font-medium text-sm">Static Pages ({STATIC_PAGES.length})</span>
            <span className="text-xs text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full">All included</span>
          </div>
          {showStaticPages ? <ChevronUp className="w-4 h-4 text-[#9cb8d9]" /> : <ChevronDown className="w-4 h-4 text-[#9cb8d9]" />}
        </button>
        <AnimatePresence>
          {showStaticPages && (
            <motion.div
              initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }}
              className="overflow-hidden"
            >
              <div className="border-t border-white/[0.07] divide-y divide-white/[0.04]">
                {STATIC_PAGES.map(page => (
                  <div key={page.path} className="flex items-center justify-between px-5 py-3">
                    <div>
                      <p className="text-sm text-white font-medium">{page.label}</p>
                      <p className="text-xs text-[#3a5a82]">{BASE}{page.path}</p>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-[#9cb8d9]">
                      <span>Priority: {page.priority}</span>
                      <span className="text-emerald-400 flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Included
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Products table */}
      <div className="bg-[#0b1a30]/70 border border-white/[0.07] rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-white/[0.07] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-white font-medium text-sm">Products ({products.length})</span>
            <span className="text-xs text-[#9cb8d9]">{includedCount} in sitemap · {products.length - includedCount} excluded</span>
          </div>
          <button onClick={copyXml} className="flex items-center gap-1.5 text-xs text-[#9cb8d9] hover:text-white transition-colors px-3 py-1.5 rounded-lg border border-white/[0.07] hover:border-white/20">
            <Copy className="w-3.5 h-3.5" />
            {copiedXml ? 'Copied!' : 'Copy XML'}
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-blue-400" />
          </div>
        ) : (
          <div className="divide-y divide-white/[0.04]">
            {products.map(product => {
              const excluded = !!(product as any).excludeFromSitemap;
              const slug = product.slug || generateSlug(product.name);
              const url = `${BASE}/products/${slug}`;
              const isActive = product.visibility !== 'hidden' && product.visibility !== 'out_of_stock';

              return (
                <ProductSitemapRow
                  key={product.id}
                  product={product}
                  slug={slug}
                  url={url}
                  excluded={excluded}
                  isActive={isActive}
                  isSaving={saving === product.id}
                  onToggle={() => toggleSitemap(product)}
                  onSaveSlug={(newSlug) => saveSlug(product, newSlug)}
                  validateSlug={validateSlug}
                />
              );
            })}
          </div>
        )}
      </div>

      {/* Activity log */}
      {log.length > 0 && (
        <div className="bg-[#0b1a30]/70 border border-white/[0.07] rounded-xl p-4">
          <p className="text-xs font-semibold text-[#3a5a82] uppercase tracking-wider mb-3">Activity Log</p>
          <div className="space-y-1.5 max-h-40 overflow-y-auto">
            {log.map((entry, i) => (
              <div key={i} className="flex items-start gap-2 text-xs">
                <span className="text-[#3a5a82] shrink-0 tabular-nums">{entry.ts}</span>
                {entry.type === 'success' && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />}
                {entry.type === 'error' && <XCircle className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />}
                {entry.type === 'info' && <AlertCircle className="w-3.5 h-3.5 text-blue-400 shrink-0 mt-0.5" />}
                <span className={entry.type === 'success' ? 'text-emerald-300' : entry.type === 'error' ? 'text-red-300' : 'text-[#9cb8d9]'}>
                  {entry.text}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Per-product row with inline slug editor ─────────────────────────────────
interface ProductRowProps {
  product: Product;
  slug: string;
  url: string;
  excluded: boolean;
  isActive: boolean;
  isSaving: boolean;
  onToggle: () => void;
  onSaveSlug: (slug: string) => void;
  validateSlug: (slug: string) => boolean;
}

function ProductSitemapRow({ product, slug, url, excluded, isActive, isSaving, onToggle, onSaveSlug, validateSlug }: ProductRowProps) {
  const [editingSlug, setEditingSlug] = useState(false);
  const [draftSlug, setDraftSlug] = useState(slug);
  const isValid = validateSlug(draftSlug);

  const handleSlugSave = () => {
    if (!isValid) return;
    onSaveSlug(draftSlug);
    setEditingSlug(false);
  };

  return (
    <div className={`px-5 py-4 transition-colors ${excluded ? 'opacity-50' : ''}`}>
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        {/* Status + name */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className={`w-2 h-2 rounded-full shrink-0 ${isActive ? 'bg-emerald-400' : 'bg-red-400'}`} />
            <span className="text-white text-sm font-medium truncate">{product.name}</span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${
              isActive ? 'text-emerald-400 border-emerald-500/20 bg-emerald-500/10' : 'text-red-400 border-red-500/20 bg-red-500/10'
            }`}>
              {product.visibility || 'active'}
            </span>
          </div>

          {/* Slug editor */}
          {editingSlug ? (
            <div className="flex items-center gap-2 mt-1">
              <span className="text-[#3a5a82] text-xs shrink-0">/products/</span>
              <input
                type="text"
                value={draftSlug}
                onChange={e => setDraftSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                className="flex-1 px-2 py-1 text-xs border rounded-md"
                autoFocus
                onKeyDown={e => { if (e.key === 'Enter') handleSlugSave(); if (e.key === 'Escape') { setEditingSlug(false); setDraftSlug(slug); } }}
              />
              <button
                onClick={handleSlugSave}
                disabled={!isValid}
                className="px-2 py-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white rounded-md text-xs transition-colors"
              >Save</button>
              <button
                onClick={() => { setEditingSlug(false); setDraftSlug(slug); }}
                className="px-2 py-1 text-[#9cb8d9] hover:text-white text-xs transition-colors"
              >Cancel</button>
            </div>
          ) : (
            <button
              onClick={() => { setEditingSlug(true); setDraftSlug(slug); }}
              className="flex items-center gap-1 text-xs text-[#3a5a82] hover:text-blue-400 transition-colors mt-1 group"
            >
              <span className="font-mono">{url}</span>
              <span className="opacity-0 group-hover:opacity-100 text-blue-400 text-[10px] border border-blue-400/30 px-1 rounded transition-opacity">edit</span>
            </button>
          )}

          {!isValid && editingSlug && (
            <p className="text-red-400 text-[10px] mt-1">Use lowercase letters, numbers and hyphens only</p>
          )}
        </div>

        {/* Sitemap toggle */}
        <div className="flex items-center gap-3 shrink-0">
          {isSaving ? (
            <Loader2 className="w-4 h-4 animate-spin text-blue-400" />
          ) : (
            <button
              onClick={onToggle}
              className="flex items-center gap-2 text-xs transition-colors"
              title={excluded ? 'Click to include in sitemap' : 'Click to exclude from sitemap'}
            >
              {excluded ? (
                <><ToggleLeft className="w-8 h-5 text-gray-500" /><span className="text-gray-500">Excluded</span></>
              ) : (
                <><ToggleRight className="w-8 h-5 text-emerald-400" /><span className="text-emerald-400">In Sitemap</span></>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
