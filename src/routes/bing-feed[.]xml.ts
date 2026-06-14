/**
 * Microsoft Merchant Center (Bing Shopping) product feed.
 *
 * RSS 2.0 with the Microsoft Shopping API namespace (c:). Public URL:
 *   https://phlabs.co.uk/bing-feed.xml
 *
 * Compliance: every item is sold as a research chemical / laboratory
 * reference standard. No medical, dosage, weight-loss, anti-aging,
 * hormonal, or human-use language. Products opted out via the
 * `excludeFromMerchantFeed` flag in Firestore are skipped here too.
 *
 * Coexists with /google-merchant-feed.xml — do not remove that route.
 */
import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { fetchAllProducts } from "@/lib/firestore-rest";

const BASE_URL = "https://phlabs.co.uk";
const BRAND = "PH LABS";
const CURRENCY = "GBP";
// Microsoft accepts the Google product taxonomy. Use the Laboratory
// Chemicals leaf the user specified — keeps the feed out of any
// healthcare classifier.
const MS_CATEGORY =
  "1624 - Business & Industrial > Science & Laboratory > Laboratory Chemicals";

function xmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function cdata(s: string): string {
  return `<![CDATA[${s.replace(/]]>/g, "]]]]><![CDATA[>")}]]>`;
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

const HARD_BLOCKED_SLUGS = new Set<string>([
  "tirzepatide-research-peptide",
  "tirzepatide",
]);

function isAllowed(p: {
  name?: string;
  slug?: string;
  excludeFromMerchantFeed?: boolean;
  includeInMerchantFeed?: boolean;
}): boolean {
  if (p.excludeFromMerchantFeed === true) return false;
  const slug = (p.slug || "").toLowerCase();
  const name = (p.name || "").toLowerCase();
  if (HARD_BLOCKED_SLUGS.has(slug)) return false;
  if (name.includes("tirzepatide")) return false;
  return p.includeInMerchantFeed === true;
}

export const Route = createFileRoute("/bing-feed.xml")({
  server: {
    handlers: {
      GET: async () => {
        let products = [] as Awaited<ReturnType<typeof fetchAllProducts>>;
        let debugError = "";
        const generatedAt = new Date().toISOString();
        try {
          products = await fetchAllProducts();
        } catch (e: any) {
          debugError = String(e?.message || e || "unknown");
          products = [];
        }

        const items = products
          .filter((p) => isAllowed(p as any))
          .map((p) => {
            const link = `${BASE_URL}/products/${p.slug}`;
            const title = `${p.name} | For Research Use Only`;
            // Bing/Microsoft Merchant flags "human consumption" the same
            // way Google does — keep the copy neutral analytical-supply.
            const desc =
              `Research chemical for laboratory and analytical use. ` +
              `Research-use only (RUO). ` +
              stripHtml(p.description || "");
            const description = desc.slice(0, 5000);
            const image = p.imageUrl
              ? p.imageUrl.startsWith("http")
                ? p.imageUrl
                : `${BASE_URL}${p.imageUrl.startsWith("/") ? "" : "/"}${p.imageUrl}`
              : `${BASE_URL}/og-image.jpg`;
            const price = `${p.price.toFixed(2)} ${CURRENCY}`;
            const availability =
              typeof p.stock === "number" && p.stock <= 0
                ? "out of stock"
                : "in stock";
            const sku = p.sku || p.id || p.slug;
            const productType = p.category || "Research Chemicals";

            return [
              `    <item>`,
              `      <title>${cdata(title)}</title>`,
              `      <link>${xmlEscape(link)}</link>`,
              `      <description>${cdata(description)}</description>`,
              `      <c:id>${xmlEscape(p.id || p.slug)}</c:id>`,
              `      <c:price>${xmlEscape(price)}</c:price>`,
              `      <c:availability>${availability}</c:availability>`,
              `      <c:condition>new</c:condition>`,
              `      <c:brand>${xmlEscape(BRAND)}</c:brand>`,
              `      <c:mpn>${xmlEscape(sku)}</c:mpn>`,
              `      <c:image_link>${xmlEscape(image)}</c:image_link>`,
              `      <c:google_product_category>${xmlEscape(MS_CATEGORY)}</c:google_product_category>`,
              `      <c:product_type>${xmlEscape(productType)}</c:product_type>`,
              `      <c:shipping>GB::Standard:0.00 ${CURRENCY}</c:shipping>`,
              `    </item>`,
            ].join("\n");
          })
          .join("\n");

        const xml = [
          `<?xml version="1.0" encoding="UTF-8"?>`,
          `<rss version="2.0" xmlns:c="http://schemas.microsoft.com/ShoppingAPI/2009/Products">`,
          `  <channel>`,
          `    <title>PH LABS Research Products</title>`,
          `    <link>${BASE_URL}</link>`,
          `    <description>PH LABS Research Peptides and Laboratory Chemicals</description>`,
          items,
          `  </channel>`,
          `</rss>`,
        ].join("\n");

        return new Response(xml, {
          status: 200,
          headers: {
            "Content-Type": "application/xml; charset=utf-8",
            // 1-hour cache as requested; Bing fetches at most a few times a day.
            "Cache-Control": "public, max-age=3600, s-maxage=3600",
            "X-Feed-Items": String(
              products.filter((p) => isAllowed(p as any)).length,
            ),
            "X-Feed-Generated-At": generatedAt,
            "X-Feed-Debug-Error": debugError.slice(0, 200) || "none",
          },
        });
      },
    },
  },
});
