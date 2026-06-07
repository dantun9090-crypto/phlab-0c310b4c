import { useEffect, useMemo, useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import {
  ExternalLink, RefreshCw, ShoppingBag, Loader2, CheckCircle2, AlertCircle,
  Plus, Pencil, Search, X, Eye, EyeOff,
} from 'lucide-react';
import {
  getShopInfo, listAdminProducts, createAdminProduct, updateAdminProduct,
} from '@/lib/shopify-admin.functions';
import { auth } from '@/lib/firebase';

async function getIdToken() {
  const t = await auth.currentUser?.getIdToken();
  if (!t) throw new Error('Not signed in');
  return t;
}

const SHOPIFY_DOMAIN_DEFAULT = '12h2iy-t0.myshopify.com';
const SHOPIFY_ADMIN_URL = 'https://admin.shopify.com/store/12h2iy-t0';
const SHOPIFY_API_VERSION = '2025-07';
const CRED_KEY = 'phlabs.shopify.credentials';

type AdminProduct = {
  id: number; title: string; handle: string; body_html: string; status: string;
  vendor: string; product_type: string; created_at: string; updated_at: string;
  image: string | null; images: { id: number; src: string; alt: string | null }[];
  price: string | null; sku: string | null; inventory: number; variantId: number | null;
};

type SortKey = 'updated_desc' | 'updated_asc' | 'title_asc' | 'title_desc' | 'price_asc' | 'price_desc' | 'inventory_desc';

type Creds = { domain: string; storefrontToken: string; adminToken: string };

function loadCreds(): Creds {
  if (typeof window === 'undefined') return { domain: SHOPIFY_DOMAIN_DEFAULT, storefrontToken: '', adminToken: '' };
  try {
    const raw = localStorage.getItem(CRED_KEY);
    if (raw) return { domain: SHOPIFY_DOMAIN_DEFAULT, storefrontToken: '', adminToken: '', ...JSON.parse(raw) };
  } catch {}
  return { domain: SHOPIFY_DOMAIN_DEFAULT, storefrontToken: '', adminToken: '' };
}

export default function ShopifyTab() {
  const list = useServerFn(listAdminProducts);
  const info = useServerFn(getShopInfo);
  const create = useServerFn(createAdminProduct);
  const update = useServerFn(updateAdminProduct);

  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [shop, setShop] = useState<Awaited<ReturnType<typeof info>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [connected, setConnected] = useState(false);

  // Grid controls
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortKey>('updated_desc');
  const [page, setPage] = useState(1);
  const pageSize = 12;

  // Editor
  const [editing, setEditing] = useState<AdminProduct | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  // Credentials
  const [creds, setCreds] = useState<Creds>(() => loadCreds());
  const [showAdmin, setShowAdmin] = useState(false);
  const [showStorefront, setShowStorefront] = useState(false);
  const [credSaved, setCredSaved] = useState(false);

  const sync = async () => {
    setSyncing(true);
    setError(null);
    try {
      const idToken = await getIdToken();
      const [s, p] = await Promise.all([info({ data: { idToken } }), list({ data: { idToken, limit: 250 } })]);
      setShop(s);
      setProducts(p as AdminProduct[]);
      setConnected(true);
      setLastSync(new Date());
    } catch (e: any) {
      setConnected(false);
      setError(e.message || 'Sync failed');
    } finally {
      setSyncing(false);
      setLoading(false);
    }
  };

  useEffect(() => { sync(); /* eslint-disable-next-line */ }, []);

  const filtered = useMemo(() => {
    let out = products;
    if (query.trim()) {
      const q = query.toLowerCase();
      out = out.filter(p =>
        p.title.toLowerCase().includes(q) ||
        p.handle.toLowerCase().includes(q) ||
        (p.sku || '').toLowerCase().includes(q) ||
        (p.vendor || '').toLowerCase().includes(q),
      );
    }
    const num = (v: string | null) => (v ? parseFloat(v) : 0);
    const cmp = {
      updated_desc: (a: AdminProduct, b: AdminProduct) => b.updated_at.localeCompare(a.updated_at),
      updated_asc: (a: AdminProduct, b: AdminProduct) => a.updated_at.localeCompare(b.updated_at),
      title_asc: (a: AdminProduct, b: AdminProduct) => a.title.localeCompare(b.title),
      title_desc: (a: AdminProduct, b: AdminProduct) => b.title.localeCompare(a.title),
      price_asc: (a: AdminProduct, b: AdminProduct) => num(a.price) - num(b.price),
      price_desc: (a: AdminProduct, b: AdminProduct) => num(b.price) - num(a.price),
      inventory_desc: (a: AdminProduct, b: AdminProduct) => b.inventory - a.inventory,
    }[sort];
    return [...out].sort(cmp);
  }, [products, query, sort]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageItems = filtered.slice((page - 1) * pageSize, page * pageSize);
  useEffect(() => { if (page > totalPages) setPage(1); }, [page, totalPages]);

  const saveCreds = () => {
    try {
      localStorage.setItem(CRED_KEY, JSON.stringify(creds));
      setCredSaved(true);
      setTimeout(() => setCredSaved(false), 2000);
    } catch {}
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <ShoppingBag className="w-6 h-6 text-emerald-400" />
            Shopify
          </h1>
          <p className="text-slate-400 text-sm mt-1">Manage your connected Shopify store.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={sync}
            disabled={syncing}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-50 min-h-[44px]"
          >
            {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            {syncing ? 'Syncing…' : 'Sync now'}
          </button>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-white border-2 border-slate-600 min-h-[44px]"
          >
            <Plus className="w-4 h-4" /> New product
          </button>
          <a
            href={SHOPIFY_ADMIN_URL}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-white border-2 border-slate-600 min-h-[44px]"
          >
            <ExternalLink className="w-4 h-4" /> Open Shopify Admin
          </a>
        </div>
      </div>

      {/* Status */}
      <div className="bg-slate-900 border border-slate-700 rounded-xl p-5">
        <div className="flex flex-wrap items-center gap-3 mb-4">
          {connected ? (
            <>
              <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              <span className="text-emerald-400 font-semibold">Connected</span>
            </>
          ) : (
            <>
              <AlertCircle className="w-5 h-5 text-red-400" />
              <span className="text-red-400 font-semibold">Disconnected</span>
            </>
          )}
          {lastSync && (
            <span className="text-xs text-slate-400 ml-auto">
              Last sync: {lastSync.toLocaleTimeString()}
            </span>
          )}
        </div>
        <dl className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div><dt className="text-slate-400">Store</dt><dd className="text-white font-mono truncate">{shop?.name ?? '—'}</dd></div>
          <div><dt className="text-slate-400">Domain</dt><dd className="text-white font-mono truncate">{shop?.myshopifyDomain ?? SHOPIFY_DOMAIN_DEFAULT}</dd></div>
          <div><dt className="text-slate-400">Currency</dt><dd className="text-white font-mono">{shop?.currency ?? '—'}</dd></div>
          <div><dt className="text-slate-400">API version</dt><dd className="text-white font-mono">{SHOPIFY_API_VERSION}</dd></div>
        </dl>
        {error && (
          <div className="mt-4 p-3 rounded-lg bg-red-950/40 border border-red-900 text-red-300 text-sm">{error}</div>
        )}
      </div>

      {/* Credentials */}
      <div className="bg-slate-900 border border-slate-700 rounded-xl p-5">
        <h2 className="text-lg font-semibold text-white mb-1">API credentials</h2>
        <p className="text-xs text-slate-400 mb-4">
          Server-side tokens are stored as encrypted secrets and cannot be displayed here. Use these fields if you ever need to reconnect with a different store.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="flex flex-col gap-2">
            <span className="text-sm text-slate-300">Store domain</span>
            <input
              value={creds.domain}
              onChange={(e) => setCreds({ ...creds, domain: e.target.value })}
              placeholder="your-store.myshopify.com"
              className="min-h-[48px] rounded-lg bg-slate-800 text-white border-2 border-slate-600 px-3 focus:border-emerald-500 outline-none"
            />
          </label>
          <label className="flex flex-col gap-2">
            <span className="text-sm text-slate-300">Storefront access token</span>
            <div className="relative">
              <input
                type={showStorefront ? 'text' : 'password'}
                value={creds.storefrontToken}
                onChange={(e) => setCreds({ ...creds, storefrontToken: e.target.value })}
                placeholder="shpat_… (leave blank to use existing secret)"
                className="w-full min-h-[48px] rounded-lg bg-slate-800 text-white border-2 border-slate-600 px-3 pr-10 focus:border-emerald-500 outline-none"
              />
              <button type="button" onClick={() => setShowStorefront((v) => !v)} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white p-2">
                {showStorefront ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </label>
          <label className="flex flex-col gap-2 md:col-span-2">
            <span className="text-sm text-slate-300">Admin API access token</span>
            <div className="relative">
              <input
                type={showAdmin ? 'text' : 'password'}
                value={creds.adminToken}
                onChange={(e) => setCreds({ ...creds, adminToken: e.target.value })}
                placeholder="shpat_… (leave blank to use existing secret)"
                className="w-full min-h-[48px] rounded-lg bg-slate-800 text-white border-2 border-slate-600 px-3 pr-10 focus:border-emerald-500 outline-none"
              />
              <button type="button" onClick={() => setShowAdmin((v) => !v)} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white p-2">
                {showAdmin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </label>
        </div>
        <div className="flex items-center gap-3 mt-4">
          <button
            onClick={saveCreds}
            className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white min-h-[44px]"
          >
            Save credentials
          </button>
          {credSaved && <span className="text-sm text-emerald-400">Saved locally.</span>}
          <span className="text-xs text-slate-500 ml-auto">
            Production tokens live in encrypted server secrets — ask the developer to rotate <code className="font-mono">SHOPIFY_ACCESS_TOKEN</code>.
          </span>
        </div>
      </div>

      {/* Grid controls */}
      <div className="bg-slate-900 border border-slate-700 rounded-xl p-5 space-y-4">
        <div className="flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={(e) => { setQuery(e.target.value); setPage(1); }}
              placeholder="Search title, handle, SKU, vendor…"
              className="w-full min-h-[48px] rounded-lg bg-slate-800 text-white border-2 border-slate-600 pl-10 pr-3 focus:border-emerald-500 outline-none"
            />
          </div>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="min-h-[48px] rounded-lg bg-slate-800 text-white border-2 border-slate-600 px-3 focus:border-emerald-500 outline-none"
          >
            <option value="updated_desc">Recently updated</option>
            <option value="updated_asc">Oldest updated</option>
            <option value="title_asc">Title A→Z</option>
            <option value="title_desc">Title Z→A</option>
            <option value="price_asc">Price low→high</option>
            <option value="price_desc">Price high→low</option>
            <option value="inventory_desc">Most stock</option>
          </select>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12 text-slate-400">
            <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading products…
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-slate-400">No products found.</div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {pageItems.map((p) => (
                <div key={p.id} className="bg-slate-800 border border-slate-700 rounded-lg overflow-hidden flex flex-col">
                  <div className="aspect-square bg-slate-950 flex items-center justify-center">
                    {p.image ? (
                      <img src={p.image} alt={p.title} className="w-full h-full object-cover" loading="lazy" />
                    ) : (
                      <ShoppingBag className="w-8 h-8 text-slate-600" />
                    )}
                  </div>
                  <div className="p-3 flex-1 flex flex-col gap-1">
                    <h3 className="text-white font-medium text-sm truncate">{p.title}</h3>
                    <p className="text-slate-400 text-xs font-mono truncate">{p.handle}</p>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-emerald-400 font-semibold text-sm">
                        {p.price ? `£${parseFloat(p.price).toFixed(2)}` : '—'}
                      </span>
                      <span className="text-xs text-slate-400">Stock: {p.inventory}</span>
                    </div>
                    <button
                      onClick={() => setEditing(p)}
                      className="mt-2 flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-white text-sm border-2 border-slate-600 min-h-[40px]"
                    >
                      <Pencil className="w-3.5 h-3.5" /> Edit
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between pt-2">
              <span className="text-xs text-slate-400">
                Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, filtered.length)} of {filtered.length}
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-white border-2 border-slate-600 disabled:opacity-40 text-sm"
                >Prev</button>
                <span className="text-sm text-slate-300 font-mono">{page} / {totalPages}</span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-white border-2 border-slate-600 disabled:opacity-40 text-sm"
                >Next</button>
              </div>
            </div>
          </>
        )}
      </div>

      {(showCreate || editing) && (
        <ProductEditor
          product={editing}
          onClose={() => { setShowCreate(false); setEditing(null); }}
          onSave={async (form) => {
            const idToken = await getIdToken();
            if (editing) {
              await update({ data: { idToken, id: editing.id, variantId: editing.variantId, ...form } });
            } else {
              await create({ data: { idToken, ...form } });
            }
            setShowCreate(false);
            setEditing(null);
            await sync();
          }}
        />
      )}
    </div>
  );
}

function ProductEditor({
  product, onClose, onSave,
}: {
  product: AdminProduct | null;
  onClose: () => void;
  onSave: (form: { title: string; body_html: string; price: string; images: string[]; status: 'active' | 'draft' }) => Promise<void>;
}) {
  const [title, setTitle] = useState(product?.title ?? '');
  const [body, setBody] = useState(product?.body_html ?? '');
  const [price, setPrice] = useState(product?.price ?? '');
  const [images, setImages] = useState<string[]>(product?.images.map((i) => i.src) ?? []);
  const [newImage, setNewImage] = useState('');
  const [status, setStatus] = useState<'active' | 'draft'>((product?.status as any) ?? 'active');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    if (!title.trim()) { setErr('Title is required.'); return; }
    setSaving(true); setErr(null);
    try {
      await onSave({ title: title.trim(), body_html: body, price: price.trim(), images, status });
    } catch (e: any) {
      setErr(e.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-2xl my-8">
        <div className="flex items-center justify-between p-5 border-b border-slate-700">
          <h2 className="text-lg font-semibold text-white">
            {product ? 'Edit product' : 'New product'}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white p-2"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-4">
          <label className="flex flex-col gap-2">
            <span className="text-sm text-slate-300">Title *</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="min-h-[48px] rounded-lg bg-slate-800 text-white border-2 border-slate-600 px-3 focus:border-emerald-500 outline-none"
            />
          </label>
          <label className="flex flex-col gap-2">
            <span className="text-sm text-slate-300">Price (GBP)</span>
            <input
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              inputMode="decimal"
              placeholder="e.g. 29.99"
              className="min-h-[48px] rounded-lg bg-slate-800 text-white border-2 border-slate-600 px-3 focus:border-emerald-500 outline-none"
            />
          </label>
          <label className="flex flex-col gap-2">
            <span className="text-sm text-slate-300">Description</span>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={5}
              className="min-h-[120px] rounded-lg bg-slate-800 text-white border-2 border-slate-600 px-3 py-2 focus:border-emerald-500 outline-none"
            />
          </label>
          <label className="flex flex-col gap-2">
            <span className="text-sm text-slate-300">Status</span>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as any)}
              className="min-h-[48px] rounded-lg bg-slate-800 text-white border-2 border-slate-600 px-3 focus:border-emerald-500 outline-none"
            >
              <option value="active">Active</option>
              <option value="draft">Draft</option>
            </select>
          </label>

          <div className="flex flex-col gap-2">
            <span className="text-sm text-slate-300">Images (URLs)</span>
            <div className="flex gap-2">
              <input
                value={newImage}
                onChange={(e) => setNewImage(e.target.value)}
                placeholder="https://…"
                className="flex-1 min-h-[48px] rounded-lg bg-slate-800 text-white border-2 border-slate-600 px-3 focus:border-emerald-500 outline-none"
              />
              <button
                type="button"
                onClick={() => { if (newImage.trim()) { setImages([...images, newImage.trim()]); setNewImage(''); } }}
                className="px-4 rounded-lg bg-slate-800 hover:bg-slate-700 text-white border-2 border-slate-600 min-h-[48px]"
              >Add</button>
            </div>
            {images.length > 0 && (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 mt-2">
                {images.map((src, i) => (
                  <div key={i} className="relative group aspect-square rounded-lg overflow-hidden bg-slate-950 border border-slate-700">
                    <img src={src} alt="" className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => setImages(images.filter((_, idx) => idx !== i))}
                      className="absolute top-1 right-1 bg-red-600 hover:bg-red-500 text-white rounded p-1 opacity-0 group-hover:opacity-100"
                    ><X className="w-3 h-3" /></button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {err && (
            <div className="p-3 rounded-lg bg-red-950/40 border border-red-900 text-red-300 text-sm">{err}</div>
          )}
        </div>
        <div className="flex items-center justify-end gap-2 p-5 border-t border-slate-700">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-white border-2 border-slate-600 min-h-[44px]"
          >Cancel</button>
          <button
            onClick={submit}
            disabled={saving}
            className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white min-h-[44px] disabled:opacity-50 flex items-center gap-2"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            {product ? 'Save changes' : 'Create product'}
          </button>
        </div>
      </div>
    </div>
  );
}
