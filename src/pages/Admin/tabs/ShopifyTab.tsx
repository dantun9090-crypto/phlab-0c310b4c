import { useEffect, useState } from 'react';
import { ExternalLink, RefreshCw, ShoppingBag, Loader2, CheckCircle2 } from 'lucide-react';

const SHOPIFY_DOMAIN = '12h2iy-t0.myshopify.com';
const SHOPIFY_ADMIN_URL = 'https://admin.shopify.com/store/12h2iy-t0';
const SHOPIFY_STOREFRONT_TOKEN = '304fb75887ff0a9183d0354214036397';
const SHOPIFY_API_VERSION = '2025-07';
const SHOPIFY_STOREFRONT_URL = `https://${SHOPIFY_DOMAIN}/api/${SHOPIFY_API_VERSION}/graphql.json`;

type Product = {
  id: string;
  title: string;
  handle: string;
  totalInventory?: number | null;
  priceRange: { minVariantPrice: { amount: string; currencyCode: string } };
  images: { edges: Array<{ node: { url: string; altText: string | null } }> };
};

const QUERY = `
  query Products($first: Int!) {
    products(first: $first) {
      edges {
        node {
          id
          title
          handle
          totalInventory
          priceRange { minVariantPrice { amount currencyCode } }
          images(first: 1) { edges { node { url altText } } }
        }
      }
    }
  }
`;

export default function ShopifyTab() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(SHOPIFY_STOREFRONT_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Storefront-Access-Token': SHOPIFY_STOREFRONT_TOKEN,
        },
        body: JSON.stringify({ query: QUERY, variables: { first: 50 } }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (json.errors) throw new Error(json.errors.map((e: any) => e.message).join(', '));
      setProducts(json.data.products.edges.map((e: any) => e.node));
    } catch (e: any) {
      setError(e.message || 'Failed to load products');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

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
        <div className="flex gap-2">
          <button
            onClick={load}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-white border-2 border-slate-600 disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Refresh
          </button>
          <a
            href={SHOPIFY_ADMIN_URL}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white"
          >
            <ExternalLink className="w-4 h-4" />
            Open Shopify Admin
          </a>
        </div>
      </div>

      {/* Status card */}
      <div className="bg-slate-900 border border-slate-700 rounded-xl p-5">
        <div className="flex items-center gap-3 mb-4">
          <CheckCircle2 className="w-5 h-5 text-emerald-400" />
          <span className="text-emerald-400 font-semibold">Connected</span>
        </div>
        <dl className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div>
            <dt className="text-slate-400">Store ID</dt>
            <dd className="text-white font-mono">12h2iy-t0</dd>
          </div>
          <div>
            <dt className="text-slate-400">Storefront domain</dt>
            <dd className="text-white font-mono">{SHOPIFY_DOMAIN}</dd>
          </div>
          <div>
            <dt className="text-slate-400">API version</dt>
            <dd className="text-white font-mono">{SHOPIFY_API_VERSION}</dd>
          </div>
          <div>
            <dt className="text-slate-400">Status</dt>
            <dd className="text-white">Claimed</dd>
          </div>
        </dl>
      </div>

      {/* Products */}
      <div className="bg-slate-900 border border-slate-700 rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">Products</h2>
          <span className="text-sm text-slate-400">{products.length} loaded</span>
        </div>

        {error && (
          <div className="p-4 rounded-lg bg-red-950/40 border border-red-900 text-red-300 text-sm mb-4">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-12 text-slate-400">
            <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading products…
          </div>
        ) : products.length === 0 ? (
          <div className="text-center py-12 text-slate-400">
            No products found in this Shopify store yet.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {products.map((p) => {
              const img = p.images.edges[0]?.node;
              const price = p.priceRange.minVariantPrice;
              return (
                <div key={p.id} className="bg-slate-800 border border-slate-700 rounded-lg overflow-hidden flex flex-col">
                  <div className="aspect-square bg-slate-950 flex items-center justify-center">
                    {img ? (
                      <img src={img.url} alt={img.altText || p.title} className="w-full h-full object-cover" loading="lazy" />
                    ) : (
                      <ShoppingBag className="w-8 h-8 text-slate-600" />
                    )}
                  </div>
                  <div className="p-3 flex-1 flex flex-col">
                    <h3 className="text-white font-medium text-sm truncate">{p.title}</h3>
                    <p className="text-slate-400 text-xs font-mono truncate">{p.handle}</p>
                    <div className="mt-2 flex items-center justify-between">
                      <span className="text-emerald-400 font-semibold text-sm">
                        {price.currencyCode} {parseFloat(price.amount).toFixed(2)}
                      </span>
                      {typeof p.totalInventory === 'number' && (
                        <span className="text-xs text-slate-400">Stock: {p.totalInventory}</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
