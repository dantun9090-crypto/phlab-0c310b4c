import type { Product } from '@/lib/firebase';

// ─────────────────────────────────────────────────────────────────────────────
// Ads & Domains: per-domain product visibility.
//
// A product with `domainVisibility: string[]` set is ONLY shown on those
// hostnames (www prefix ignored). Products without the field show on ALL
// domains — existing catalogue behaviour is unchanged until an admin opts a
// product out of a domain in Admin → Ads & Domains.
//
// The interface augmentation below adds the field to Product without editing
// firebase.ts (keeps the hot file untouched for Lovable merges).
// ─────────────────────────────────────────────────────────────────────────────

declare module '@/lib/firebase' {
  interface Product {
    // Hostnames (no www) this product is visible on. Empty/absent = everywhere.
    domainVisibility?: string[];
  }
}

export const normalizeHost = (h: string): string =>
  (h || '').toLowerCase().replace(/^www\./, '').split(':')[0];

export const isProductVisibleOnHost = (p: Product, hostname?: string): boolean => {
  const dv = p.domainVisibility;
  if (!dv || dv.length === 0) return true;
  const host = normalizeHost(
    hostname ?? (typeof window !== 'undefined' ? window.location.hostname : ''),
  );
  if (!host) return true;
  return dv.some((d) => normalizeHost(String(d)) === host);
};

export const filterProductsForHost = (products: Product[], hostname?: string): Product[] =>
  products.filter((p) => isProductVisibleOnHost(p, hostname));

// Storefront variant of getAllProducts — applies the per-domain filter.
// Dynamic import keeps the Firebase SDK off the caller's bundle path.
export const getVisibleProducts = async (): Promise<Product[]> => {
  const { getAllProducts } = await import('@/lib/firebase');
  return filterProductsForHost(await getAllProducts());
};
