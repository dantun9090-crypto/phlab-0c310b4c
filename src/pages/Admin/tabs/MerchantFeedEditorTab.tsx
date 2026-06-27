/**
 * Full editable Google Merchant Feed editor.
 *
 * Manages 4 feeds independently:
 *   - phlabs_paid       phlabs.co.uk/google-merchant-feed.xml
 *   - phlabs_free       phlabs.co.uk/google-merchant-feed-free.xml
 *   - prohealth_paid    legacy host /google-merchant-feed.xml
 *   - prohealth_free    legacy host /google-merchant-feed-free.xml
 *
 * Features: global settings, inclusion toggles, per-product overrides,
 * risk rules, live diff preview against the rendered XML.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  RefreshCw, ExternalLink, Save, Search, CheckCircle2, XCircle, Eye, AlertTriangle,
} from 'lucide-react';
import { getAdminIdToken } from '@/lib/auth-ready';
import {
  getMerchantFeedConfig,
  saveMerchantFeedConfig,
  saveMerchantFeedOverride,
  bulkSetMerchantFeedInclusion,
  listMerchantFeedProducts,
} from '@/lib/merchant-feed-admin.functions';

const FEEDS = [
  { key: 'phlabs_paid', label: 'phlabs.co.uk · Paid (Shopping)', url: 'https://phlabs.co.uk/google-merchant-feed.xml' },
  { key: 'phlabs_free', label: 'phlabs.co.uk · Free Listings', url: 'https://phlabs.co.uk/google-merchant-feed-free.xml' },
  // check-domains-allow-next-line
  { key: 'prohealth_paid', label: 'prohealthpeptides.co.uk · Paid', url: 'https://prohealthpeptides.co.uk/google-merchant-feed.xml' },
  // check-domains-allow-next-line
  { key: 'prohealth_free', label: 'prohealthpeptides.co.uk · Free', url: 'https://prohealthpeptides.co.uk/google-merchant-feed-free.xml' },
] as const;

type FeedKey = (typeof FEEDS)[number]['key'];

interface ConfigData {
  enabled: boolean;
  brand: string;
  currency: string;
  baseUrl: string;
  categoryId: string;
  categoryPath: string;
  productType: string;
  condition: string;
  identifierExists: string;
  ageGroup: string;
  adult: string;
  titleTemplate: string;
  descriptionTemplate: string;
  disclaimers: string;
  promoIds: string[];
  shippingCountry: string;
  shippingService: string;
  shippingPrice: string;
  bannedTokens: string[];
  hardBlockedSlugs: string[];
  highRiskTokens: string[];
  customLabel0: string;
  customLabel1: string;
  customLabel2: string;
  customLabel3: string;
  customLabel4: string;
  updatedAt?: string;
  updatedBy?: string;
}

interface ProductRow {
  id: string;
  name: string;
  slug: string;
  price: number;
  imageUrl?: string;
  stock?: number;
  sku?: string;
  includeInMerchantFeed?: boolean;
  excludeFromMerchantFeed?: boolean;
  override: null | {
    included?: boolean | null;
    title?: string;
    description?: string;
    price?: number;
    image?: string;
    sku?: string;
    mpn?: string;
    availability?: string;
    customLabel0?: string;
    customLabel1?: string;
    customLabel2?: string;
    customLabel3?: string;
    customLabel4?: string;
  };
  willAppear: boolean;
}

type SaveState = { type: 'idle' } | { type: 'saving' } | { type: 'ok' } | { type: 'error'; message: string };

export default function MerchantFeedEditorTab() {
  const [feedKey, setFeedKey] = useState<FeedKey>('phlabs_paid');
  const [section, setSection] = useState<'settings' | 'products' | 'risk' | 'preview'>('settings');
  const [config, setConfig] = useState<ConfigData | null>(null);
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>({ type: 'idle' });
  const [search, setSearch] = useState('');
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [previewXml, setPreviewXml] = useState<string>('');
  const [previewLoading, setPreviewLoading] = useState(false);

  const currentFeed = useMemo(() => FEEDS.find((f) => f.key === feedKey)!, [feedKey]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const idToken = await getAdminIdToken();
      if (!idToken) throw new Error('Admin auth required');
      const [{ config: cfg }, { products: prods }] = await Promise.all([
        getMerchantFeedConfig({ data: { idToken, feedKey } }),
        listMerchantFeedProducts({ data: { idToken, feedKey } }),
      ]);
      setConfig(cfg as ConfigData);
      setProducts(prods as ProductRow[]);
    } catch (err) {
      setSaveState({ type: 'error', message: err instanceof Error ? err.message : String(err) });
    } finally {
      setLoading(false);
    }
  }, [feedKey]);

  useEffect(() => { void load(); }, [load]);

  const updateConfigField = <K extends keyof ConfigData>(field: K, value: ConfigData[K]) => {
    setConfig((prev) => (prev ? { ...prev, [field]: value } : prev));
  };

  const saveConfig = async () => {
    if (!config) return;
    setSaveState({ type: 'saving' });
    try {
      const idToken = await getAdminIdToken();
      if (!idToken) throw new Error('Admin auth required');
      const { updatedAt: _u, updatedBy: _b, ...patch } = config;
      void _u; void _b;
      await saveMerchantFeedConfig({ data: { idToken, feedKey, patch: patch as Record<string, unknown> } });
      setSaveState({ type: 'ok' });
      setTimeout(() => setSaveState({ type: 'idle' }), 2500);
      await load();
    } catch (err) {
      setSaveState({ type: 'error', message: err instanceof Error ? err.message : String(err) });
    }
  };

  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return products;
    return products.filter(
      (p) => p.name?.toLowerCase().includes(q) || p.slug?.toLowerCase().includes(q) || p.id.toLowerCase().includes(q),
    );
  }, [products, search]);

  const setInclusion = async (productId: string, included: boolean | null) => {
    try {
      const idToken = await getAdminIdToken();
      if (!idToken) throw new Error('Admin auth required');
      await saveMerchantFeedOverride({ data: { idToken, feedKey, productId, patch: { included } } });
      await load();
    } catch (err) {
      setSaveState({ type: 'error', message: err instanceof Error ? err.message : String(err) });
    }
  };

  const bulkInclude = async (included: boolean) => {
    if (!confirm(`Apply "${included ? 'Include' : 'Exclude'}" to ${filteredProducts.length} products in ${currentFeed.label}?`)) return;
    try {
      const idToken = await getAdminIdToken();
      if (!idToken) throw new Error('Admin auth required');
      const ids = filteredProducts.slice(0, 500).map((p) => p.id);
      await bulkSetMerchantFeedInclusion({ data: { idToken, feedKey, productIds: ids, included } });
      await load();
    } catch (err) {
      setSaveState({ type: 'error', message: err instanceof Error ? err.message : String(err) });
    }
  };

  const loadPreview = useCallback(async () => {
    setPreviewLoading(true);
    try {
      const url = currentFeed.url + `?t=${Date.now()}`;
      const res = await fetch(url, { credentials: 'omit' });
      setPreviewXml(await res.text());
    } catch (err) {
      setPreviewXml(`Error loading: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setPreviewLoading(false);
    }
  }, [currentFeed.url]);

  useEffect(() => { if (section === 'preview') void loadPreview(); }, [section, loadPreview]);

  return (
    <div className="space-y-4 p-4 max-w-[1400px]">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b pb-3">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Google Merchant Feed Editor</h2>
          <p className="text-sm text-gray-600">
            100% editable feed — settings, inclusion, per-product overrides, risk rules.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="inline-flex items-center gap-2 px-3 py-2 rounded border bg-white text-sm hover:bg-gray-50"
            aria-label="Reload feed configuration"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Reload
          </button>
          <a
            href={currentFeed.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-3 py-2 rounded border bg-white text-sm hover:bg-gray-50"
          >
            <ExternalLink className="w-4 h-4" /> Open live feed
          </a>
        </div>
      </header>

      {/* Feed selector */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {FEEDS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFeedKey(f.key)}
            className={`text-left px-3 py-2 rounded border text-xs font-medium ${
              feedKey === f.key
                ? 'bg-blue-50 border-blue-500 text-blue-900'
                : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
            }`}
            aria-pressed={feedKey === f.key}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Section nav */}
      <nav className="flex flex-wrap gap-2 border-b">
        {(['settings', 'products', 'risk', 'preview'] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setSection(s)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px capitalize ${
              section === s ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-600 hover:text-gray-900'
            }`}
          >
            {s === 'risk' ? 'Risk Rules' : s}
          </button>
        ))}
      </nav>

      {saveState.type === 'error' && (
        <div className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700">
          {saveState.message}
        </div>
      )}
      {saveState.type === 'ok' && (
        <div className="rounded border border-green-300 bg-green-50 p-3 text-sm text-green-700">
          Saved. Live feed updates within 30 seconds.
        </div>
      )}

      {!config && loading && <div className="text-gray-500">Loading…</div>}

      {config && section === 'settings' && (
        <SettingsPanel config={config} onChange={updateConfigField} onSave={saveConfig} saveState={saveState} />
      )}

      {config && section === 'risk' && (
        <RiskPanel config={config} onChange={updateConfigField} onSave={saveConfig} saveState={saveState} />
      )}

      {config && section === 'products' && (
        <ProductsPanel
          products={filteredProducts}
          search={search}
          onSearch={setSearch}
          onToggleInclude={setInclusion}
          onBulk={bulkInclude}
          onEdit={setEditingProductId}
        />
      )}

      {editingProductId && (
        <OverrideModal
          feedKey={feedKey}
          product={products.find((p) => p.id === editingProductId)!}
          onClose={() => setEditingProductId(null)}
          onSaved={() => { setEditingProductId(null); void load(); }}
        />
      )}

      {section === 'preview' && (
        <PreviewPanel xml={previewXml} loading={previewLoading} onReload={loadPreview} url={currentFeed.url} />
      )}
    </div>
  );
}

// ---------------- Settings ----------------

function SettingsPanel({
  config, onChange, onSave, saveState,
}: {
  config: ConfigData;
  onChange: <K extends keyof ConfigData>(field: K, value: ConfigData[K]) => void;
  onSave: () => void;
  saveState: SaveState;
}) {
  const text = (label: string, field: keyof ConfigData, multi = false) => (
    <label className="block text-sm">
      <span className="block text-gray-700 font-medium mb-1">{label}</span>
      {multi ? (
        <textarea
          className="w-full border rounded px-2 py-1 text-sm font-mono"
          rows={3}
          value={String(config[field] ?? '')}
          onChange={(e) => onChange(field, e.target.value as ConfigData[typeof field])}
        />
      ) : (
        <input
          className="w-full border rounded px-2 py-1 text-sm"
          value={String(config[field] ?? '')}
          onChange={(e) => onChange(field, e.target.value as ConfigData[typeof field])}
        />
      )}
    </label>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 p-3 rounded border bg-amber-50 border-amber-200">
        <label className="flex items-center gap-2 text-sm font-medium text-amber-900">
          <input
            type="checkbox"
            checked={config.enabled}
            onChange={(e) => onChange('enabled', e.target.checked)}
          />
          Feed enabled (uncheck to publish an empty feed)
        </label>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {text('Brand', 'brand')}
        {text('Currency (ISO 4217)', 'currency')}
        {text('Base URL', 'baseUrl')}
        {text('Google Category ID', 'categoryId')}
        {text('Google Category Path', 'categoryPath')}
        {text('Product Type', 'productType')}
        {text('Condition', 'condition')}
        {text('Identifier Exists', 'identifierExists')}
        {text('Age Group', 'ageGroup')}
        {text('Adult', 'adult')}
        {text('Shipping Country', 'shippingCountry')}
        {text('Shipping Service', 'shippingService')}
        {text('Shipping Price', 'shippingPrice')}
      </div>

      <div className="grid grid-cols-1 gap-3">
        {text('Title Template ({name}, {size}, {sku}, {brand})', 'titleTemplate', true)}
        {text('Description Template', 'descriptionTemplate', true)}
        {text('Disclaimers', 'disclaimers', true)}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
        {text('Custom Label 0', 'customLabel0')}
        {text('Custom Label 1', 'customLabel1')}
        {text('Custom Label 2', 'customLabel2')}
        {text('Custom Label 3', 'customLabel3')}
        {text('Custom Label 4', 'customLabel4')}
      </div>

      <label className="block text-sm">
        <span className="block text-gray-700 font-medium mb-1">Promo IDs (comma-separated)</span>
        <input
          className="w-full border rounded px-2 py-1 text-sm"
          value={(config.promoIds || []).join(', ')}
          onChange={(e) => onChange('promoIds', e.target.value.split(',').map((s) => s.trim()).filter(Boolean))}
        />
      </label>

      <div className="flex items-center gap-3 pt-2">
        <button
          type="button"
          onClick={onSave}
          disabled={saveState.type === 'saving'}
          className="inline-flex items-center gap-2 px-4 py-2 rounded bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
        >
          <Save className="w-4 h-4" /> Save Settings
        </button>
        {config.updatedAt && (
          <span className="text-xs text-gray-500">
            Last updated {new Date(config.updatedAt).toLocaleString()}
            {config.updatedBy ? ` by ${config.updatedBy}` : ''}
          </span>
        )}
      </div>
    </div>
  );
}

// ---------------- Risk rules ----------------

function RiskPanel({
  config, onChange, onSave, saveState,
}: {
  config: ConfigData;
  onChange: <K extends keyof ConfigData>(field: K, value: ConfigData[K]) => void;
  onSave: () => void;
  saveState: SaveState;
}) {
  const list = (label: string, field: 'bannedTokens' | 'hardBlockedSlugs' | 'highRiskTokens', hint: string) => (
    <label className="block text-sm">
      <span className="block text-gray-800 font-medium mb-1">{label}</span>
      <span className="block text-xs text-gray-500 mb-1">{hint}</span>
      <textarea
        className="w-full border rounded px-2 py-1 text-sm font-mono"
        rows={6}
        value={(config[field] || []).join('\n')}
        onChange={(e) =>
          onChange(field, e.target.value.split('\n').map((s) => s.trim()).filter(Boolean) as ConfigData[typeof field])
        }
      />
    </label>
  );

  return (
    <div className="space-y-4">
      <div className="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 flex gap-2">
        <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
        <div>
          Risk rules feed straight into Google policy filters. Tokens are matched case-insensitive against
          product name + slug. Hard-blocked slugs are dropped from the feed entirely.
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {list('Banned tokens (description scrub list)', 'bannedTokens', 'One per line. Used for description audit warnings.')}
        {list('Hard-blocked slugs (always exclude)', 'hardBlockedSlugs', 'One per line. Slug or substring match on name.')}
        {list('High-risk tokens (force SKU-only title)', 'highRiskTokens', 'One per line. Trigger conservative title for paid feed.')}
      </div>
      <button
        type="button"
        onClick={onSave}
        disabled={saveState.type === 'saving'}
        className="inline-flex items-center gap-2 px-4 py-2 rounded bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
      >
        <Save className="w-4 h-4" /> Save Risk Rules
      </button>
    </div>
  );
}

// ---------------- Products list ----------------

function ProductsPanel({
  products, search, onSearch, onToggleInclude, onBulk, onEdit,
}: {
  products: ProductRow[];
  search: string;
  onSearch: (s: string) => void;
  onToggleInclude: (id: string, included: boolean | null) => Promise<void>;
  onBulk: (included: boolean) => Promise<void>;
  onEdit: (id: string) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 absolute left-2 top-2.5 text-gray-400" />
          <input
            className="w-full border rounded pl-8 pr-2 py-1.5 text-sm"
            placeholder="Search by name, slug, or ID"
            value={search}
            onChange={(e) => onSearch(e.target.value)}
          />
        </div>
        <button
          type="button"
          onClick={() => void onBulk(true)}
          className="px-3 py-1.5 rounded border bg-white text-sm hover:bg-gray-50"
        >
          Include filtered
        </button>
        <button
          type="button"
          onClick={() => void onBulk(false)}
          className="px-3 py-1.5 rounded border bg-white text-sm hover:bg-gray-50"
        >
          Exclude filtered
        </button>
        <span className="text-xs text-gray-500">{products.length} products</span>
      </div>

      <div className="overflow-x-auto border rounded">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs uppercase text-gray-600">
            <tr>
              <th className="px-3 py-2">Product</th>
              <th className="px-3 py-2">Price</th>
              <th className="px-3 py-2">SKU</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Override</th>
              <th className="px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <tr key={p.id} className="border-t">
                <td className="px-3 py-2">
                  <div className="font-medium text-gray-900">{p.name}</div>
                  <div className="text-xs text-gray-500">{p.slug || p.id}</div>
                </td>
                <td className="px-3 py-2">£{(p.override?.price ?? p.price ?? 0).toFixed(2)}</td>
                <td className="px-3 py-2 font-mono text-xs">{p.override?.sku ?? p.sku ?? '—'}</td>
                <td className="px-3 py-2">
                  {p.willAppear ? (
                    <span className="inline-flex items-center gap-1 text-green-700 text-xs">
                      <CheckCircle2 className="w-3.5 h-3.5" /> In feed
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-gray-500 text-xs">
                      <XCircle className="w-3.5 h-3.5" /> Hidden
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 text-xs text-gray-600">
                  {p.override
                    ? Object.keys(p.override).filter((k) => k !== 'productId' && k !== 'updatedAt').join(', ') || '—'
                    : '—'}
                </td>
                <td className="px-3 py-2">
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => void onToggleInclude(p.id, true)}
                      className="px-2 py-1 rounded border text-xs hover:bg-gray-50"
                    >Include</button>
                    <button
                      type="button"
                      onClick={() => void onToggleInclude(p.id, false)}
                      className="px-2 py-1 rounded border text-xs hover:bg-gray-50"
                    >Exclude</button>
                    <button
                      type="button"
                      onClick={() => void onToggleInclude(p.id, null)}
                      className="px-2 py-1 rounded border text-xs hover:bg-gray-50"
                    >Default</button>
                    <button
                      type="button"
                      onClick={() => onEdit(p.id)}
                      className="px-2 py-1 rounded border text-xs bg-blue-50 hover:bg-blue-100 text-blue-700"
                    >Edit</button>
                  </div>
                </td>
              </tr>
            ))}
            {products.length === 0 && (
              <tr><td colSpan={6} className="px-3 py-6 text-center text-gray-500">No products match.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------- Override modal ----------------

function OverrideModal({
  feedKey, product, onClose, onSaved,
}: {
  feedKey: FeedKey;
  product: ProductRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const ov = product.override ?? {};
  const [title, setTitle] = useState<string>(ov.title ?? '');
  const [description, setDescription] = useState<string>(ov.description ?? '');
  const [price, setPrice] = useState<string>(ov.price != null ? String(ov.price) : '');
  const [image, setImage] = useState<string>(ov.image ?? '');
  const [sku, setSku] = useState<string>(ov.sku ?? '');
  const [mpn, setMpn] = useState<string>(ov.mpn ?? '');
  const [availability, setAvailability] = useState<string>(ov.availability ?? '');
  const [cl0, setCl0] = useState<string>(ov.customLabel0 ?? '');
  const [cl1, setCl1] = useState<string>(ov.customLabel1 ?? '');
  const [cl2, setCl2] = useState<string>(ov.customLabel2 ?? '');
  const [cl3, setCl3] = useState<string>(ov.customLabel3 ?? '');
  const [cl4, setCl4] = useState<string>(ov.customLabel4 ?? '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const save = async () => {
    setBusy(true);
    setErr(null);
    try {
      const idToken = await getAdminIdToken();
      if (!idToken) throw new Error('Admin auth required');
      const patch: Record<string, unknown> = {};
      if (title) patch.title = title;
      if (description) patch.description = description;
      if (price) {
        const n = Number(price);
        if (Number.isFinite(n) && n >= 0) patch.price = n;
      }
      if (image) patch.image = image;
      if (sku) patch.sku = sku;
      if (mpn) patch.mpn = mpn;
      if (availability) patch.availability = availability;
      if (cl0) patch.customLabel0 = cl0;
      if (cl1) patch.customLabel1 = cl1;
      if (cl2) patch.customLabel2 = cl2;
      if (cl3) patch.customLabel3 = cl3;
      if (cl4) patch.customLabel4 = cl4;
      await saveMerchantFeedOverride({ data: { idToken, feedKey, productId: product.id, patch: patch as never } });
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center overflow-y-auto p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl my-8">
        <header className="flex items-center justify-between px-4 py-3 border-b">
          <div>
            <h3 className="font-bold text-gray-900">Override · {product.name}</h3>
            <p className="text-xs text-gray-500">Feed: {feedKey} · Product ID: {product.id}</p>
          </div>
          <button type="button" onClick={onClose} className="p-1 rounded hover:bg-gray-100">✕</button>
        </header>
        <div className="p-4 space-y-3">
          {err && <div className="rounded border border-red-300 bg-red-50 p-2 text-sm text-red-700">{err}</div>}
          <Field label="Title"><input className="w-full border rounded px-2 py-1 text-sm" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="(use default)" /></Field>
          <Field label="Description"><textarea rows={3} className="w-full border rounded px-2 py-1 text-sm" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="(use default)" /></Field>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Price (GBP)"><input className="w-full border rounded px-2 py-1 text-sm" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="(default)" /></Field>
            <Field label="SKU"><input className="w-full border rounded px-2 py-1 text-sm" value={sku} onChange={(e) => setSku(e.target.value)} /></Field>
            <Field label="MPN"><input className="w-full border rounded px-2 py-1 text-sm" value={mpn} onChange={(e) => setMpn(e.target.value)} /></Field>
          </div>
          <Field label="Image URL (absolute https://)"><input className="w-full border rounded px-2 py-1 text-sm" value={image} onChange={(e) => setImage(e.target.value)} /></Field>
          <Field label="Availability">
            <select className="border rounded px-2 py-1 text-sm" value={availability} onChange={(e) => setAvailability(e.target.value)}>
              <option value="">(default)</option>
              <option value="in stock">in stock</option>
              <option value="out of stock">out of stock</option>
              <option value="preorder">preorder</option>
              <option value="backorder">backorder</option>
            </select>
          </Field>
          <div className="grid grid-cols-5 gap-2">
            <Field label="Label 0"><input className="w-full border rounded px-2 py-1 text-sm" value={cl0} onChange={(e) => setCl0(e.target.value)} /></Field>
            <Field label="Label 1"><input className="w-full border rounded px-2 py-1 text-sm" value={cl1} onChange={(e) => setCl1(e.target.value)} /></Field>
            <Field label="Label 2"><input className="w-full border rounded px-2 py-1 text-sm" value={cl2} onChange={(e) => setCl2(e.target.value)} /></Field>
            <Field label="Label 3"><input className="w-full border rounded px-2 py-1 text-sm" value={cl3} onChange={(e) => setCl3(e.target.value)} /></Field>
            <Field label="Label 4"><input className="w-full border rounded px-2 py-1 text-sm" value={cl4} onChange={(e) => setCl4(e.target.value)} /></Field>
          </div>
        </div>
        <footer className="px-4 py-3 border-t flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-3 py-1.5 rounded border bg-white text-sm hover:bg-gray-50">Cancel</button>
          <button type="button" onClick={() => void save()} disabled={busy} className="px-3 py-1.5 rounded bg-blue-600 text-white text-sm hover:bg-blue-700 disabled:opacity-50">
            {busy ? 'Saving…' : 'Save Override'}
          </button>
        </footer>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="block text-gray-700 font-medium text-xs mb-1">{label}</span>
      {children}
    </label>
  );
}

// ---------------- Preview ----------------

function PreviewPanel({ xml, loading, onReload, url }: { xml: string; loading: boolean; onReload: () => void; url: string }) {
  const itemCount = (xml.match(/<item>/g) || []).length;
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <button type="button" onClick={onReload} disabled={loading} className="inline-flex items-center gap-2 px-3 py-1.5 rounded border bg-white text-sm hover:bg-gray-50">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Reload preview
        </button>
        <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 px-3 py-1.5 rounded border bg-white text-sm hover:bg-gray-50">
          <Eye className="w-4 h-4" /> Open raw XML
        </a>
        <span className="text-xs text-gray-500">{itemCount} items · {(xml.length / 1024).toFixed(1)} KB</span>
      </div>
      <pre className="border rounded bg-gray-50 p-3 text-[11px] font-mono max-h-[600px] overflow-auto whitespace-pre-wrap">
        {xml || (loading ? 'Loading…' : '(empty)')}
      </pre>
    </div>
  );
}
