import type { SeoProduct } from "./firestore-rest";
import { SITE_URL } from "./seo-meta";

/**
 * Canonical product URL builder.
 *
 * - format = 'slug' → /products/{slug}  (sitemap, Bing feed, internal links)
 * - format = 'id'   → /products/{id}    (Google Merchant feed only)
 *
 * Both formats resolve to the same product page. The slug URL is canonical;
 * the ID URL renders the same page with the same canonical <link> pointing
 * back to the slug version (no redirect — the URL stays as the ID).
 */
export function getProductUrl(
  product: Pick<SeoProduct, "id" | "slug">,
  format: "slug" | "id" = "slug",
): string {
  const path = format === "id" ? product.id : product.slug;
  return `${SITE_URL}/products/${path}`;
}
