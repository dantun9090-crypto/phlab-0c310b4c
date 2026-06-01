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

export interface UnitPricingMeasure {
  value: number;
  unit: "mg" | "g" | "kg" | "ml" | "cl" | "l" | "ct";
}

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
  sku?: string;
  mpn?: string;
  gtin?: string;
  stock?: number;
  coaUrl?: string;
  updatedAt?: string;
  /** Parsed from variant name/dosage, e.g. "10 mg" → { value: 10, unit: "mg" }. */
  unitPricingMeasure?: UnitPricingMeasure;
}

/**
 * Parse a dosage / variant name (e.g. "10 mg", "1000mcg", "5 ml") into a
 * Google Merchant–compatible unit_pricing_measure. Supported units only:
 * mg, g, kg, ml, cl, l, ct. Returns null when nothing parseable found.
 */
export function parseUnitPricingMeasure(input: string | undefined | null): UnitPricingMeasure | null {
  if (!input) return null;
  const s = String(input).toLowerCase().trim();
  const m = s.match(/(\d+(?:[.,]\d+)?)\s*(mcg|µg|ug|mg|g|kg|ml|cl|l|ct|iu)\b/);
  if (!m) return null;
  let value = parseFloat(m[1].replace(",", "."));
  let unit = m[2];
  if (!isFinite(value) || value <= 0) return null;
  if (unit === "mcg" || unit === "µg" || unit === "ug") {
    value = value / 1000;
    unit = "mg";
  }
  if (unit === "iu") unit = "ct";
  return { value, unit: unit as UnitPricingMeasure["unit"] };
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
  const variantStocks: number[] = variants
    .map((v: any) => (v && typeof v.stock === "number" ? v.stock : null))
    .filter((s): s is number => s != null);
  const totalStock = variantStocks.length
    ? variantStocks.reduce((a, b) => a + b, 0)
    : typeof f.stock === "number"
      ? f.stock
      : undefined;
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
    sku: typeof f.sku === "string" && f.sku.trim() ? f.sku : undefined,
    mpn: typeof f.mpn === "string" && f.mpn.trim() ? f.mpn : undefined,
    gtin: typeof f.gtin === "string" && f.gtin.trim() ? f.gtin : undefined,
    stock: totalStock,
    coaUrl: typeof f.coaUrl === "string" && f.coaUrl.trim() ? f.coaUrl : undefined,
    updatedAt: typeof f.updatedAt === "string" ? f.updatedAt : undefined,
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
  const exact = all.find((p) => p.slug === slug);
  if (exact) return exact;
  // 2) Legacy auto-slug from product name
  const legacy = all.find((p) => slugify(p.name) === slug);
  if (legacy) return legacy;
  // 3) Short Merchant Center URLs that should resolve to a longer SEO slug
  //    (e.g. "klow-blend" → "klow-blend-laboratory-reference-blend-research-use").
  const forwardPrefix = all.filter((p) => p.slug.startsWith(slug + "-"));
  if (forwardPrefix.length === 1) return forwardPrefix[0];
  // check-domains-allow-next-line: nazwa starej domeny tylko w komentarzu
  // 4) Long legacy URLs from the old prohealthpeptides.co.uk catalogue that
  //    should resolve to the current shorter slug (e.g.
  //    "tirzepatide-research-reference-compound-for-lab-use" → "tirzepatide").
  //    Pick the LONGEST product slug that the input starts with, so e.g.
  //    "tb-500-thymosin-beta-4-foo" prefers "tb-500-thymosin-beta-4" over "tb-500".
  const reversePrefix = all
    .filter((p) => slug.startsWith(p.slug + "-"))
    .sort((a, b) => b.slug.length - a.slug.length);
  if (reversePrefix.length > 0) return reversePrefix[0];
  return null;
}

export { slugify };
