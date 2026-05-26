/**
 * Server-safe Firestore REST helpers.
 *
 * Reads `product_stock` via the public Firestore REST API so that
 * /products and /products/$slug can emit real HTML for crawlers
 * (prerender.io, Googlebot direct) without bundling the Firebase JS SDK
 * on the server.
 */

const PROJECT_ID = "prohealthpeptides-a0808";
const API_KEY = "AIzaSyB5sWYCTkzeFFup0mqyg3PzCIzjP2oGJdM";
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

export interface SeoProduct {
  id: string;
  name: string;
  slug: string;
  description: string;
  category: string;
  price: number;
  imageUrl: string;
  purity?: string;
  isActive: boolean;
  visibility: string;
  displayOrder: number;
  seoTitle?: string;
  seoDescription?: string;
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[()[\]]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function unwrap(value: any): any {
  if (value == null) return null;
  if ("stringValue" in value) return value.stringValue;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("doubleValue" in value) return Number(value.doubleValue);
  if ("booleanValue" in value) return value.booleanValue;
  if ("timestampValue" in value) return value.timestampValue;
  if ("nullValue" in value) return null;
  if ("arrayValue" in value) {
    return (value.arrayValue.values ?? []).map(unwrap);
  }
  if ("mapValue" in value) {
    return unwrapFields(value.mapValue.fields ?? {});
  }
  return null;
}

function unwrapFields(fields: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const k of Object.keys(fields)) out[k] = unwrap(fields[k]);
  return out;
}

/**
 * Slug overrides by Firestore doc ID. Use when a product name was changed
 * for Google Merchant / SEO reasons but the URL must stay short and stable
 * (preserves Google's existing index + backlinks).
 */
const SLUG_OVERRIDES: Record<string, string> = {
  kONztvd1Xj5FQwAYMaT4: "bpc-157",
};

function toProduct(doc: any): SeoProduct | null {
  const f = unwrapFields(doc.fields ?? {});
  const name: string = f.name ?? "";
  if (!name) return null;
  const docId = f.id ?? String(doc.name).split("/").pop() ?? "";
  const variants: Array<{ price?: number }> = Array.isArray(f.variants) ? f.variants : [];
  const variantPrices = variants
    .map((v) => (v && typeof v.price === "number" ? v.price : null))
    .filter((p): p is number => p != null);
  const price = variantPrices.length
    ? Math.min(...variantPrices)
    : typeof f.price === "number"
      ? f.price
      : 0;
  return {
    id: docId,
    name,
    slug: SLUG_OVERRIDES[docId] || f.slug || slugify(name),
    description: (f.description ?? "").toString(),
    category: f.category ?? "",
    price,
    imageUrl: f.imageUrl ?? "",
    purity: f.purity,
    isActive: f.isActive !== false,
    visibility: f.visibility ?? "active",
    displayOrder: typeof f.displayOrder === "number" ? f.displayOrder : 999,
    seoTitle: typeof f.seoTitle === "string" && f.seoTitle.trim() ? f.seoTitle : undefined,
    seoDescription: typeof f.seoDescription === "string" && f.seoDescription.trim() ? f.seoDescription : undefined,
  };
}

/**
 * Slugs hidden from the public site (catalogue, sitemap, product pages).
 * Used to deindex products from Google Merchant auto-feed without deleting
 * the Firestore document. After ~3–7 days Google re-crawls and drops the
 * product from Merchant Center automatically.
 */
const HIDDEN_SLUGS: Set<string> = new Set(["bpc-157"]);

function isHidden(p: SeoProduct): boolean {
  if (HIDDEN_SLUGS.has(p.slug)) return true;
  if (HIDDEN_SLUGS.has(slugify(p.name))) return true;
  return false;
}

/** Fetch all active, visible products from Firestore via REST. */
export async function fetchAllProducts(): Promise<SeoProduct[]> {
  const url = `${BASE}/product_stock?key=${API_KEY}&pageSize=300`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) return [];
  const json: any = await res.json();
  const docs: any[] = json.documents ?? [];
  const products = docs
    .map(toProduct)
    .filter(
      (p): p is SeoProduct =>
        p != null && p.isActive && p.visibility !== "hidden" && !isHidden(p),
    )
    .sort((a, b) => a.displayOrder - b.displayOrder);
  return products;
}

export async function fetchProductBySlug(slug: string): Promise<SeoProduct | null> {
  if (HIDDEN_SLUGS.has(slug)) return null;
  const all = await fetchAllProducts();
  // 1) Exact slug match
  // 2) Legacy auto-slug from product name
  // 3) Prefix match — handles short Merchant Center URLs like
  //    "klow-blend" that should resolve to the full SEO slug
  //    "klow-blend-laboratory-reference-blend-research-use".
  const exact = all.find((p) => p.slug === slug);
  if (exact) return exact;
  const legacy = all.find((p) => slugify(p.name) === slug);
  if (legacy) return legacy;
  const prefix = all.filter((p) => p.slug.startsWith(slug + "-"));
  if (prefix.length === 1) return prefix[0];
  return null;
}

export { slugify };
