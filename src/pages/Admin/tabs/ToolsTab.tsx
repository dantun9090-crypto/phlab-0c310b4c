import { useState } from 'react';
import {
  Database, AlertTriangle, CheckCircle2, Loader2, Package, Zap, Shield,
  RefreshCw, Globe, Clock, ExternalLink, Copy
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

import { db, collection, getDocs, doc, deleteDoc, getAllProducts, updateProduct, addDoc, query, where, updateDoc, Timestamp } from '@/lib/firebase';
import { seedProducts, nameToSlug } from '@/lib/seedProducts';
import { findMerchantEntry, MERCHANT_SEO_ENTRIES } from '@/lib/merchantSeoData';

const SITE_BASE = 'https://www.prohealthpeptides.co.uk';

// Static pages to always include in recache
const STATIC_PAGES = [
  '/',
  '/products',
  '/research',
  '/resources',
  '/lab-reports',
  '/about',
  '/contact',
  '/storage-guide',
  '/quality-control',
];

// Firebase storage rules template
// SECURITY: Writes/deletes are restricted to admin accounts only.
// `request.auth != null` would allow ANY signed-in customer to overwrite or delete
// product images, banners, adverts and manuals — we gate on the `customers/{uid}.isAdmin`
// flag in Firestore instead.
const STORAGE_RULES = `rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    function isAdmin() {
      return request.auth != null
        && firestore.exists(/databases/(default)/documents/customers/$(request.auth.uid))
        && firestore.get(/databases/(default)/documents/customers/$(request.auth.uid)).data.isAdmin == true;
    }

    match /banners/{fileName} {
      allow read: if true;
      allow write, delete: if isAdmin();
    }
    match /products/{allPaths=**} {
      allow read: if true;
      allow write, delete: if isAdmin();
    }
    match /adverts/{fileName} {
      allow read: if true;
      allow write, delete: if isAdmin();
    }
    match /manuals/{fileName} {
      allow read: if true;
      allow write, delete: if isAdmin();
    }
    match /{allPaths=**} {
      allow read, write: if false;
    }
  }
}`;


export default function ToolsTab() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [_catalogPreview, _setCatalogPreview] = useState<any[]>([]);

  // Prerender state
  const [prerenderLoading, setPrerenderLoading] = useState(false);
  const [prerenderResult, setPrerenderResult] = useState<{ type: 'success' | 'error'; message: string; urls?: string[] } | null>(null);
  const [lastRecache, setLastRecache] = useState<string | null>(() => {
    try { return localStorage.getItem('php_last_recache'); } catch { return null; }
  });

  // Dedupe state
  type DupGroup = { slug: string; keepId: string; deleteIds: string[]; names: string[] };
  const [dedupeLoading, setDedupeLoading] = useState(false);
  const [dedupeGroups, setDedupeGroups] = useState<DupGroup[] | null>(null);
  const [dedupeResult, setDedupeResult] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);

  const scanDuplicates = async () => {
    setDedupeLoading(true);
    setDedupeResult(null);
    setDedupeGroups(null);
    try {
      const snap = await getDocs(collection(db, 'product_stock'));
      const bySlug = new Map<string, Array<{ id: string; name: string; updatedAt: number }>>();
      snap.docs.forEach(d => {
        const data = d.data() as Record<string, unknown>;
        const name = (data.name as string) || '';
        const slug = ((data.slug as string) || nameToSlug(name) || '').toLowerCase().trim();
        if (!slug) return;
        // updatedAt may be Firestore Timestamp, number, or missing — coerce to ms
        let ts = 0;
        const u = data.updatedAt as { toMillis?: () => number; seconds?: number } | number | undefined;
        if (typeof u === 'number') ts = u;
        else if (u && typeof u.toMillis === 'function') ts = u.toMillis();
        else if (u && typeof u.seconds === 'number') ts = u.seconds * 1000;
        const arr = bySlug.get(slug) || [];
        arr.push({ id: d.id, name, updatedAt: ts });
        bySlug.set(slug, arr);
      });

      const groups: DupGroup[] = [];
      bySlug.forEach((rows, slug) => {
        if (rows.length < 2) return;
        // Keep newest by updatedAt; tiebreak by doc id (stable)
        rows.sort((a, b) => b.updatedAt - a.updatedAt || b.id.localeCompare(a.id));
        const [keep, ...rest] = rows;
        groups.push({
          slug,
          keepId: keep.id,
          deleteIds: rest.map(r => r.id),
          names: [keep.name, ...rest.map(r => r.name)],
        });
      });

      if (groups.length === 0) {
        setDedupeResult({ type: 'success', message: `No duplicate slugs found across ${snap.size} products.` });
      } else {
        const total = groups.reduce((n, g) => n + g.deleteIds.length, 0);
        setDedupeGroups(groups);
        setDedupeResult({ type: 'info', message: `Found ${groups.length} duplicated slug(s); ${total} document(s) would be deleted. Review and click Apply to remove.` });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setDedupeResult({ type: 'error', message: `Scan failed: ${msg}` });
    } finally {
      setDedupeLoading(false);
    }
  };

  const applyDedupe = async () => {
    if (!dedupeGroups || dedupeGroups.length === 0) return;
    const total = dedupeGroups.reduce((n, g) => n + g.deleteIds.length, 0);
    if (!confirm(`Delete ${total} duplicate product document(s)?\n\nThis keeps the newest entry per slug and cannot be undone.`)) return;
    setDedupeLoading(true);
    try {
      let deleted = 0;
      for (const g of dedupeGroups) {
        for (const id of g.deleteIds) {
          await deleteDoc(doc(db, 'product_stock', id));
          deleted++;
        }
      }
      setDedupeGroups(null);
      setDedupeResult({ type: 'success', message: `Removed ${deleted} duplicate product document(s). Run scan again to verify.` });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setDedupeResult({ type: 'error', message: `Apply failed: ${msg}` });
    } finally {
      setDedupeLoading(false);
    }
  };

  const handleReplaceCatalog = async () => {
    if (!confirm(
      'This will DELETE ALL existing products and replace them with the new research peptide catalog.\n\n' +
      'This action cannot be undone.\n\n' +
      'Are you absolutely sure?'
    )) return;

    setLoading(true);
    setResult(null);

    try {
      // Step 1: Delete all existing products
      const productsRef = collection(db, 'product_stock');
      const snapshot = await getDocs(productsRef);
      
      console.log(`Deleting ${snapshot.size} existing products...`);
      
      for (const docSnap of snapshot.docs) {
        await deleteDoc(doc(db, 'product_stock', docSnap.id));
      }

      // Step 2: Call seedProducts to add all new products
      const seedResult = await seedProducts();
      
      if (!seedResult.success) {
        throw new Error(seedResult.message);
      }

      setResult({
        type: 'success',
        message: `Catalog replaced successfully!\n\nDeleted ${snapshot.size} old products\nAdded ${seedResult.count} new research peptides\nAll with laboratory descriptions and CAS numbers`
      });

    } catch (error: any) {
      console.error('Catalog replacement failed:', error);
      setResult({
        type: 'error',
        message: `Failed to replace catalog: ${error.message}`
      });
    } finally {
      setLoading(false);
    }
  };

  const handleRecacheAll = async () => {
    setPrerenderLoading(true);
    setPrerenderResult(null);

    try {
      // 1. Fetch all products from Firestore
      const snap = await getDocs(collection(db, 'product_stock'));
      const productUrls = snap.docs
        .filter(d => d.data().isActive !== false)
        .map(d => `${SITE_BASE}/products/${nameToSlug(d.data().name)}`);

      // 2. Build full URL list: static pages + product pages
      const allUrls = [
        ...STATIC_PAGES.map(p => `${SITE_BASE}${p}`),
        ...productUrls,
      ];

      // 3. Read Prerender token from env
      const token = import.meta.env.VITE_PRERENDER_TOKEN as string | undefined;
      if (!token) {
        // Token not available client-side (correct for security).
        // Show URLs so admin can paste into curl command.
        setPrerenderResult({
          type: 'success',
          message: `${allUrls.length} URLs ready for recache. Copy the curl command below and run it from your terminal (the API token must stay server-side).`,
          urls: allUrls,
        });
        return;
      }

      // 4. Send recache request (batches of 100)
      const BATCH = 100;
      let sent = 0;
      for (let i = 0; i < allUrls.length; i += BATCH) {
        const batch = allUrls.slice(i, i + BATCH);
        await fetch('https://api.prerender.io/recache', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prerenderToken: token, urls: batch }),
        });
        sent += batch.length;
      }

      const now = new Date().toLocaleString('en-GB');
      setLastRecache(now);
      try { localStorage.setItem('php_last_recache', now); } catch { /* noop */ }

      setPrerenderResult({
        type: 'success',
        message: `Recache queued for ${sent} URLs (${productUrls.length} product pages + ${STATIC_PAGES.length} static pages).`,
        urls: allUrls,
      });
    } catch (err: any) {
      setPrerenderResult({
        type: 'error',
        message: `Recache failed: ${err.message}`,
      });
    } finally {
      setPrerenderLoading(false);
    }
  };

  const tools = [
    {
      id: 'replace-catalog',
      name: 'Replace Product Catalog',
      description: `Delete all existing products and load the new research peptide catalog with laboratory descriptions`,
      icon: Database,
      color: 'from-blue-600 to-blue-500',
      buttonText: 'Replace Catalog',
      action: handleReplaceCatalog,
      critical: true
    }
  ];

  // Build curl command for manual recache
  const curlLines = prerenderResult?.urls
    ? [
        `# Paste into your terminal:`,
        `curl -s -X POST https://api.prerender.io/recache \\`,
        `  -H "Content-Type: application/json" \\`,
        `  -d '{"prerenderToken":"YOUR_TOKEN","urls":${JSON.stringify(prerenderResult.urls)}}'`,
      ].join('\n')
    : '';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-blue-600/20 flex items-center justify-center">
          <Zap className="w-5 h-5 text-blue-400" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-[#f0f6ff]">Admin Tools</h2>
          <p className="text-[#6b8fba] text-sm">Powerful utilities for catalog management</p>
        </div>
      </div>

      {/* ── Prerender.io Recache ───────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-[#0b1a30]/70 border border-white/[0.08] rounded-2xl p-6 space-y-4"
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-emerald-600/20 flex items-center justify-center shrink-0">
            <Globe className="w-5 h-5 text-emerald-400" />
          </div>
          <div>
            <h3 className="text-[#f0f6ff] font-semibold">Prerender.io — Recache All Pages</h3>
            <p className="text-[#6b8fba] text-xs mt-0.5">
              Force Google to see fresh HTML for all product pages and static pages after any content change.
            </p>
          </div>
        </div>

        {lastRecache && (
          <div className="flex items-center gap-2 text-xs text-[#3a5a82]">
            <Clock className="w-3.5 h-3.5" />
            Last recache: <span className="text-[#6b8fba]">{lastRecache}</span>
          </div>
        )}

        <div className="flex flex-wrap gap-3 items-center">
          <button
            onClick={handleRecacheAll}
            disabled={prerenderLoading}
            className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold rounded-xl transition-all shadow-lg hover:shadow-emerald-500/25 hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed disabled:translate-y-0"
          >
            {prerenderLoading
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Queuing recache…</>
              : <><RefreshCw className="w-4 h-4" /> Recache All Pages</>}
          </button>
          <a
            href="https://dashboard.prerender.io"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-xs text-[#3a5a82] hover:text-[#6b8fba] transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Prerender Dashboard
          </a>
        </div>

        <AnimatePresence>
          {prerenderResult && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className={`rounded-xl p-4 text-sm border ${
                prerenderResult.type === 'success'
                  ? 'bg-emerald-900/20 border-emerald-500/20 text-emerald-300'
                  : 'bg-red-900/20 border-red-500/20 text-red-300'
              }`}
            >
              <div className="flex items-start gap-2">
                {prerenderResult.type === 'success'
                  ? <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                  : <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />}
                <span>{prerenderResult.message}</span>
              </div>

              {/* Show URLs list */}
              {prerenderResult.urls && prerenderResult.urls.length > 0 && (
                <details className="mt-3">
                  <summary className="cursor-pointer text-xs text-[#6b8fba] hover:text-white transition-colors">
                    {prerenderResult.urls.length} URLs included ▸
                  </summary>
                  <div className="mt-2 max-h-48 overflow-y-auto rounded-lg bg-[#04101f] p-3 space-y-1">
                    {prerenderResult.urls.map(u => (
                      <div key={u} className="text-[11px] text-[#3a5a82] font-mono truncate">{u}</div>
                    ))}
                  </div>
                  {curlLines && (
                    <div className="mt-3">
                      <p className="text-xs text-[#3a5a82] mb-1">Manual curl command (replace YOUR_TOKEN):</p>
                      <pre className="text-[10px] text-[#6b8fba] bg-[#04101f] rounded-lg p-3 overflow-x-auto whitespace-pre-wrap">{curlLines}</pre>
                    </div>
                  )}
                </details>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* ── Dedupe Products by Slug ───────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-[#0b1a30]/70 border border-white/[0.08] rounded-2xl p-6 space-y-4"
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-purple-600/20 flex items-center justify-center shrink-0">
            <Copy className="w-5 h-5 text-purple-400" />
          </div>
          <div>
            <h3 className="text-[#f0f6ff] font-semibold">Dedupe Products by Slug</h3>
            <p className="text-[#6b8fba] text-xs mt-0.5">
              Scan <code className="bg-[#04101f] px-1.5 py-0.5 rounded text-[#8caad4]">product_stock</code> for duplicate slugs. Keeps the newest entry per slug (by <code className="bg-[#04101f] px-1.5 py-0.5 rounded text-[#8caad4]">updatedAt</code>).
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-3 items-center">
          <button
            onClick={scanDuplicates}
            disabled={dedupeLoading}
            className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {dedupeLoading
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Working…</>
              : <><RefreshCw className="w-4 h-4" /> Scan (dry-run)</>}
          </button>
          {dedupeGroups && dedupeGroups.length > 0 && (
            <button
              onClick={applyDedupe}
              disabled={dedupeLoading}
              className="flex items-center gap-2 px-5 py-2.5 bg-red-600 hover:bg-red-500 text-white text-sm font-semibold rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <AlertTriangle className="w-4 h-4" /> Apply: delete {dedupeGroups.reduce((n, g) => n + g.deleteIds.length, 0)} duplicate(s)
            </button>
          )}
        </div>

        <AnimatePresence>
          {dedupeResult && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className={`rounded-xl p-4 text-sm border ${
                dedupeResult.type === 'success'
                  ? 'bg-emerald-900/20 border-emerald-500/20 text-emerald-300'
                  : dedupeResult.type === 'error'
                  ? 'bg-red-900/20 border-red-500/20 text-red-300'
                  : 'bg-blue-900/20 border-blue-500/20 text-blue-300'
              }`}
            >
              <div className="flex items-start gap-2">
                {dedupeResult.type === 'success'
                  ? <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                  : <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />}
                <span>{dedupeResult.message}</span>
              </div>
              {dedupeGroups && dedupeGroups.length > 0 && (
                <details className="mt-3" open>
                  <summary className="cursor-pointer text-xs text-[#6b8fba] hover:text-white transition-colors">
                    {dedupeGroups.length} duplicated slug(s) ▸
                  </summary>
                  <div className="mt-2 max-h-72 overflow-y-auto rounded-lg bg-[#04101f] p-3 space-y-2">
                    {dedupeGroups.map(g => (
                      <div key={g.slug} className="text-[11px] font-mono">
                        <div className="text-[#8caad4]">{g.slug}</div>
                        <div className="text-emerald-400 pl-3">keep: {g.keepId}</div>
                        {g.deleteIds.map(id => (
                          <div key={id} className="text-red-400 pl-3">delete: {id}</div>
                        ))}
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Firebase Storage Fix Instructions */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="bg-[#0b1a30]/70 border border-white/[0.08] rounded-2xl overflow-hidden"
      >
        <div className="p-6 border-b border-white/[0.06]">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-9 h-9 rounded-xl bg-yellow-600/10 flex items-center justify-center shrink-0">
              <Shield className="w-5 h-5 text-yellow-400" />
            </div>
            <div>
              <h3 className="text-[#f0f6ff] font-semibold">Firebase Storage Rules</h3>
              <p className="text-[#6b8fba] text-xs">Deploy to fix image upload permissions</p>
            </div>
          </div>
          <p className="text-[#6b8fba] text-sm mb-3">
            If image uploads are failing with permission errors, deploy these rules via{' '}
            <strong className="text-[#8caad4]">Firebase Console → Storage → Rules</strong>.
          </p>
          <pre className="text-[11px] text-[#6b8fba] bg-[#04101f] rounded-xl p-4 overflow-x-auto border border-white/[0.06]">
            {STORAGE_RULES}
          </pre>
        </div>
      </motion.div>

      {/* Catalog tools */}
      <div className="space-y-4">
        {tools.map((tool, idx) => {
          const Icon = tool.icon;
          return (
            <motion.div
              key={tool.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.1 + 0.1 }}
              className="bg-[#0b1a30]/70 border border-white/[0.08] rounded-2xl overflow-hidden"
            >
              <div className="p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex items-start gap-4">
                  <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${tool.color} flex items-center justify-center shrink-0`}>
                    <Icon className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h3 className="text-[#f0f6ff] font-semibold">{tool.name}</h3>
                    <p className="text-[#6b8fba] text-sm mt-1">{tool.description}</p>
                    {tool.critical && (
                      <div className="flex items-center gap-1.5 mt-2">
                        <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
                        <span className="text-red-400 text-xs font-medium">Destructive — cannot be undone</span>
                      </div>
                    )}
                    <AnimatePresence>
                      {result && (
                        <motion.div
                          initial={{ opacity: 0, y: 4 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0 }}
                          className={`mt-3 p-3 rounded-xl text-sm border ${
                            result.type === 'success'
                              ? 'bg-emerald-900/20 border-emerald-500/20 text-emerald-300'
                              : result.type === 'error'
                              ? 'bg-red-900/20 border-red-500/20 text-red-300'
                              : 'bg-blue-900/20 border-blue-500/20 text-blue-300'
                          }`}
                        >
                          <div className="flex items-start gap-2">
                            {result.type === 'success' ? (
                              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                            ) : (
                              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                            )}
                            <span className="whitespace-pre-line">{result.message}</span>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
                <button
                  onClick={tool.action}
                  disabled={loading}
                  className={`px-6 py-3 rounded-xl font-medium transition-all flex items-center gap-2 ${
                    tool.critical
                      ? 'bg-red-600 hover:bg-red-500 text-white'
                      : 'bg-blue-600 hover:bg-blue-500 text-white'
                  } disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:shadow-xl hover:-translate-y-0.5`}
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <Icon className="w-4 h-4" />
                      {tool.buttonText}
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Product List Info */}
      <div className="bg-[#0b1a30]/70 border border-white/[0.08] rounded-2xl p-6">
        <h3 className="text-[#f0f6ff] font-semibold mb-4 flex items-center gap-2">
          <Package className="w-5 h-5 text-blue-400" />
          Catalog Information
        </h3>
        <p className="text-[#6b8fba] text-sm">
          This tool uses the <code className="bg-[#04101f] px-2 py-1 rounded text-[#8caad4]">seedProducts()</code> function from <code className="bg-[#04101f] px-2 py-1 rounded text-[#8caad4]">@/lib/seedProducts</code> to manage the product catalog.
        </p>
        <p className="text-[#6b8fba] text-sm mt-3">
          Click "Replace Catalog" to delete all existing products and load the complete research peptide catalog with laboratory descriptions, CAS numbers, and specifications.
        </p>
      </div>

      {/* ── Merchant Center SEO Migration ───────────────────── */}
      <MerchantSeoMigration />

      {/* ── Protocol Library lead-magnet coupon ───────────────── */}
      <ProtocolLibraryCouponTool />
    </div>
  );
}

function MerchantSeoMigration() {
  const [running, setRunning] = useState(false);
  const [report, setReport] = useState<
    | { ok: true; updated: string[]; skipped: string[] }
    | { ok: false; error: string }
    | null
  >(null);

  const apply = async () => {
    if (!confirm(`Apply Google Merchant Center–compliant titles and descriptions to all matching products in Firestore? This updates the product name and description fields for the ${MERCHANT_SEO_ENTRIES.length} mapped compounds. Prices, stock, images, and variants are not touched.`)) return;
    setRunning(true);
    setReport(null);
    try {
      const products = await getAllProducts();
      const updated: string[] = [];
      const skipped: string[] = [];
      for (const p of products) {
        const entry = findMerchantEntry(p.name || '');
        if (!entry) { skipped.push(p.name); continue; }
        await updateProduct(p.id!, { name: entry.name, description: entry.description });
        updated.push(`${p.name} → ${entry.name}`);
      }
      setReport({ ok: true, updated, skipped });
    } catch (e: any) {
      setReport({ ok: false, error: e?.message || 'Update failed' });
    } finally {
      setRunning(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-[#0b1a30]/70 border border-white/[0.08] rounded-2xl p-6 space-y-4"
    >
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-amber-600/20 flex items-center justify-center shrink-0">
          <Shield className="w-5 h-5 text-amber-400" />
        </div>
        <div>
          <h3 className="text-[#f0f6ff] font-semibold">Apply Merchant Center SEO to Products</h3>
          <p className="text-[#6b8fba] text-xs mt-0.5">
            Rewrites each product's name and description in Firestore with British-English,
            Merchant-Center–compliant copy (no medical claims; explicit "laboratory research use only").
          </p>
        </div>
      </div>

      <button
        onClick={apply}
        disabled={running}
        className="flex items-center gap-2 px-5 py-2.5 bg-amber-600 hover:bg-amber-500 text-white text-sm font-semibold rounded-xl transition-all disabled:opacity-50"
      >
        {running
          ? <><Loader2 className="w-4 h-4 animate-spin" /> Updating products…</>
          : <><Shield className="w-4 h-4" /> Apply Merchant SEO to all matching products</>}
      </button>

      <AnimatePresence>
        {report && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className={`rounded-xl p-4 text-sm border ${
              report.ok
                ? 'bg-emerald-900/20 border-emerald-500/20 text-emerald-300'
                : 'bg-red-900/20 border-red-500/20 text-red-300'
            }`}
          >
            {report.ok ? (
              <>
                <div className="flex items-center gap-2 font-semibold">
                  <CheckCircle2 className="w-4 h-4" /> Updated {report.updated.length} product(s).
                </div>
                {report.updated.length > 0 && (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-xs text-[#6b8fba]">Show updated</summary>
                    <ul className="mt-2 space-y-1 text-xs text-[#8caad4]">
                      {report.updated.map((line) => <li key={line}>• {line}</li>)}
                    </ul>
                  </details>
                )}
                {report.skipped.length > 0 && (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-xs text-[#6b8fba]">
                      {report.skipped.length} product(s) had no SEO mapping (skipped)
                    </summary>
                    <ul className="mt-2 space-y-1 text-xs text-[#8caad4]">
                      {report.skipped.map((n) => <li key={n}>• {n}</li>)}
                    </ul>
                  </details>
                )}
              </>
            ) : (
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /> {report.error}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
