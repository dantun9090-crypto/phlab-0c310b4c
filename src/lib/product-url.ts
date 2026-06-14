/**
 * Canonical product URL helper.
 *
 * Two URL formats are supported (both render the same product page):
 *   - 'slug' → /products/{slug}  — canonical, SEO-friendly, used in
 *                                  sitemap.xml, Bing feed, internal nav.
 *   - 'id'   → /products/{id}    — Firestore document ID, used in the
 *                                  Google Merchant feed only.
 */
export type ProductUrlFormat = "slug" | "id";

export interface ProductLike {
  id?: string;
  slug?: string;
}

const SITE = "https://phlabs.co.uk";

export function getProductUrl(
  product: ProductLike,
  format: ProductUrlFormat = "slug",
  baseUrl: string = SITE,
): string {
  const base = baseUrl.replace(/\/$/, "");
  if (format === "id") {
    const id = product.id || product.slug;
    return `${base}/products/${id}`;
  }
  const slug = product.slug || product.id;
  return `${base}/products/${slug}`;
}
