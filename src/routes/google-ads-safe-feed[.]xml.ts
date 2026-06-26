/**
 * Google Ads–safe Merchant Center feed.
 *
 * A separate, narrowly-filtered product feed designed to pass Google Ads'
 * Healthcare & Medicines + Dangerous Products policy review. It contains
 * ONLY non-restricted laboratory consumables (currently Bacteriostatic
 * Water and similar). Every peptide / research-compound SKU is excluded
 * regardless of how it is labelled in Firestore.
 *
 * Submit this feed (NOT /google-merchant-feed.xml) as the source for the
 * Merchant Center account linked to Google Ads. The full feed remains in
 * place for free Shopping listings only.
 *
 * Public URL: https://phlabs.co.uk/google-ads-safe-feed.xml
 */
import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { fetchAllProducts } from "@/lib/firestore-rest";

const BASE_URL = "https://phlabs.co.uk";
const BRAND = "PH Labs";
const CURRENCY = "GBP";

// Google product taxonomy — Laboratory Chemicals (3002). Keeps the feed
// out of any healthcare/supplement classifier.
const CATEGORY_ID = "3002";
const CATEGORY_PATH =
  "Business & Industrial > Science & Laboratory > Laboratory Chemicals";

/**
 * Strict allow-list of slugs that may appear in this feed. Anything not
 * in this list is dropped, even if Firestore flags it as "safe". Add a
 * slug here ONLY after manually confirming that the product:
 *   - contains no restricted active (no peptides, no GLP-1/GIP/glucagon
 *     agonists, no BPC/TB/MOTS/KPV/GHK/PT-141/Melanotan, no NAD+)
 *   - is sold as a general laboratory consumable / diluent / reagent
 *   - has a landing page free of any pharmaceutical INN
 */
const ALLOWED_SLUGS = new Set<string>([
  "bacteriostatic-water-research-compound",
  "bacteriostatic-water",
]);

/**
 * Defensive name filter — even if a slug is allow-listed, drop the item
 * if its name contains any restricted token. Belt-and-braces.
 */
const NAME_BLOCKLIST = [
  "peptide",
  "retatrutide",
  "tirzepatide",
  "semaglutide",
  "bpc",
  "tb-500",
  "tb500",
  "mots",
  "kpv",
  "ghk",
  "pt-141",
  "pt141",
  "melanotan",
  "ipamorelin",
  "cjc",
  "nad",
  "glow",
  "klow",
];

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

function isAllowed(p: {
  name?: string;
  slug?: string;
  excludeFromMerchantFeed?: boolean;
}): boolean {
  if (p.excludeFromMerchantFeed === true) return false;
  const slug = (p.slug || "").toLowerCase();
  const name = (p.name || "").toLowerCase();
  if (!ALLOWED_SLUGS.has(slug)) return false;
  if (NAME_BLOCKLIST.some((tok) => name.includes(tok) && tok !== "nad")) {
    // "nad" is short enough to false-positive; only block exact NAD+ via slug
    return false;
  }
  return true;
}

export const Route = createFileRoute("/google-ads-safe-feed.xml")({
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

        const allowed = products.filter((p) => isAllowed(p as any));

        const items = allowed
          .map((p) => {
            const link = `${BASE_URL}/products/${p.slug}`;
            const title = `${p.name} — Laboratory Reagent | PH Labs`;
            const desc =
              `General laboratory reagent for analytical and in-vitro ` +
              `research use only. ` +
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

            return [
              `    <item>`,
              `      <g:id>${xmlEscape(p.id || p.slug || sku)}</g:id>`,
              `      <g:title>${cdata(title)}</g:title>`,
              `      <g:description>${cdata(description)}</g:description>`,
              `      <g:link>${xmlEscape(link)}</g:link>`,
              `      <g:image_link>${xmlEscape(image)}</g:image_link>`,
              `      <g:availability>${availability}</g:availability>`,
              `      <g:price>${xmlEscape(price)}</g:price>`,
              `      <g:brand>${xmlEscape(BRAND)}</g:brand>`,
              `      <g:condition>new</g:condition>`,
              `      <g:mpn>${xmlEscape(sku)}</g:mpn>`,
              `      <g:identifier_exists>false</g:identifier_exists>`,
              `      <g:google_product_category>${xmlEscape(CATEGORY_PATH)}</g:google_product_category>`,
              `      <g:product_type>${xmlEscape("Laboratory Reagents")}</g:product_type>`,
              `      <g:adult>no</g:adult>`,
              `      <g:shipping><g:country>GB</g:country><g:service>Standard</g:service><g:price>0.00 ${CURRENCY}</g:price></g:shipping>`,
              `    </item>`,
            ].join("\n");
          })
          .join("\n");

        const xml = [
          `<?xml version="1.0" encoding="UTF-8"?>`,
          `<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">`,
          `  <channel>`,
          `    <title>PH Labs — Google Ads Safe Feed</title>`,
          `    <link>${BASE_URL}</link>`,
          `    <description>Non-restricted laboratory reagents only. Safe for Google Ads / Shopping.</description>`,
          `    <!-- google_product_category id ${CATEGORY_ID} (${CATEGORY_PATH}) -->`,
          items,
          `  </channel>`,
          `</rss>`,
        ].join("\n");

        return new Response(xml, {
          status: 200,
          headers: {
            "Content-Type": "application/xml; charset=utf-8",
            // Google fetches manually — never serve a cached version.
            "Cache-Control": "no-store",
            "Surrogate-Control": "no-store",
            "CDN-Cache-Control": "no-store",
            "X-Feed-Items": String(allowed.length),
            "X-Feed-Generated-At": generatedAt,
            "X-Feed-Debug-Error": debugError.slice(0, 200) || "none",
          },
        });
      },
    },
  },
});
