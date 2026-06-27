import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { fetchAllProducts } from "@/lib/firestore-rest";

/**
 * ============================================================================
 * SECOND GOOGLE MERCHANT CENTER FEED — FULL MOLECULE NAMES
 * ============================================================================
 *
 * Public URL: https://phlabs.co.uk/google-merchant-feed-free.xml
 *
 * ⚠️  CRITICAL — FREE LISTINGS ONLY. NEVER ENABLE FOR SHOPPING ADS. ⚠️
 *
 * This feed is intended for a SEPARATE Merchant Center account / data source
 * that is configured with:
 *   - Destinations:  Free listings  ✅
 *                    Shopping ads   ❌ (must be OFF)
 *                    Display ads    ❌ (must be OFF)
 *
 * It uses the full molecule names (Retatrutide, BPC-157, Melanotan-II, etc.)
 * for organic discovery via the free Google Shopping tab. Enabling paid
 * destinations will trigger pharmaceutical / unapproved-substance
 * disapprovals and may suspend the Google Ads account it is linked to.
 *
 * The PRIMARY feed at /google-merchant-feed.xml stays SKU-coded and remains
 * the only feed safe for Shopping Ads.
 * ============================================================================
 */

const BASE_URL = "https://phlabs.co.uk";
const BRAND = "PH Labs";
const CURRENCY = "GBP";

// Hard block — never list under any circumstances (active pharma trial).
const HARD_BLOCKED_NAMES = ["tirzepatide"];

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

/**
 * Strip product-name suffixes used internally so the feed shows the bare
 * molecule name (e.g. "Retatrutide Research Peptide" → "Retatrutide").
 */
function cleanFullName(rawName: string): string {
  let n = (rawName || "").trim();
  n = n.replace(/\s+Research\s+(Peptide|Compound)s?$/i, "");
  return n;
}

function isAllowedForFreeListing(p: {
  name?: string;
  slug?: string;
  excludeFromMerchantFeed?: boolean;
  includeInMerchantFeed?: boolean;
}): boolean {
  if (p.excludeFromMerchantFeed === true) return false;
  const name = (p.name || "").toLowerCase();
  if (HARD_BLOCKED_NAMES.some((b) => name.includes(b))) return false;
  return p.includeInMerchantFeed === true;
}

export const Route = createFileRoute("/google-merchant-feed-free.xml")({
  server: {
    handlers: {
      GET: async () => {
        let products = [] as Awaited<ReturnType<typeof fetchAllProducts>>;
        const generatedAt = new Date().toISOString();
        try {
          products = await fetchAllProducts();
        } catch {
          products = [];
        }

        const eligible = products.filter((p) => isAllowedForFreeListing(p as any));

        const items = eligible
          .map((p) => {
            const docId = p.id;
            const fullName = cleanFullName(p.name);
            const sizeLabel =
              p.unitPricingMeasure && p.unitPricingMeasure.value > 0
                ? `${p.unitPricingMeasure.value} ${p.unitPricingMeasure.unit}`
                : "";
            const sizeCompact = sizeLabel.replace(/\s+/g, "");

            // Full-name title format for organic Google Shopping tab.
            const title = sizeLabel
              ? `${fullName} ${sizeLabel} — Lyophilised Research Reference Standard | PH Labs`
              : `${fullName} — Lyophilised Research Reference Standard | PH Labs`;

            const description =
              `${fullName} supplied as a lyophilised solid for in-vitro ` +
              `laboratory research and analytical reference use. HPLC-verified ` +
              `purity. Certificate of Analysis available on request. ` +
              `For Research Use Only. Not for Human Consumption.`;

            const image = p.imageUrl
              ? p.imageUrl.startsWith("http")
                ? p.imageUrl
                : `${BASE_URL}${p.imageUrl.startsWith("/") ? "" : "/"}${p.imageUrl}`
              : `${BASE_URL}/og-image.jpg`;

            const seenImages = new Set<string>([image]);
            const additionalImageTags = (p.additionalImages ?? [])
              .map((u) =>
                u.startsWith("http") ? u : `${BASE_URL}${u.startsWith("/") ? "" : "/"}${u}`,
              )
              .filter((abs) => {
                if (seenImages.has(abs)) return false;
                seenImages.add(abs);
                return true;
              })
              .slice(0, 10)
              .map(
                (abs) =>
                  `    <g:additional_image_link>${xmlEscape(abs)}</g:additional_image_link>`,
              );

            const link = `${BASE_URL}/products/${docId}`;
            const price = `${p.price.toFixed(2)} ${CURRENCY}`;
            const availability =
              typeof p.stock === "number" && p.stock <= 0 ? "out of stock" : "in stock";
            const sku = (p.sku || docId).trim();
            const hasGtin = !!p.gtin;
            const isWater = /bacteriostatic\s+water/i.test(p.name);
            const purityHighlight = isWater
              ? "HPLC-verified 99% purity"
              : "HPLC-verified 99%+ purity";

            return [
              `  <item>`,
              `    <g:id>${xmlEscape(`FREE-${docId}`)}</g:id>`,
              `    <title>${cdata(title)}</title>`,
              `    <link>${xmlEscape(link)}</link>`,
              `    <g:mobile_link>${xmlEscape(link)}</g:mobile_link>`,
              `    <description>${cdata(description)}</description>`,
              `    <g:image_link>${xmlEscape(image)}</g:image_link>`,
              ...additionalImageTags,
              `    <g:availability>${availability}</g:availability>`,
              `    <g:price>${xmlEscape(price)}</g:price>`,
              `    <g:brand>${xmlEscape(BRAND)}</g:brand>`,
              `    <g:condition>new</g:condition>`,
              `    <g:mpn>${xmlEscape(sku)}</g:mpn>`,
              `    <g:sku>${xmlEscape(sku)}</g:sku>`,
              hasGtin ? `    <g:gtin>${xmlEscape(p.gtin!)}</g:gtin>` : null,
              `    <g:item_group_id>${xmlEscape(docId)}</g:item_group_id>`,
              `    <g:google_product_category>499954</g:google_product_category>`,
              `    <g:product_type>Business &amp; Industrial &gt; Science &amp; Laboratory &gt; Laboratory Chemicals</g:product_type>`,
              `    <g:adult>no</g:adult>`,
              `    <g:age_group>adult</g:age_group>`,
              `    <g:is_bundle>no</g:is_bundle>`,
              `    <g:multipack>1</g:multipack>`,
              `    <g:shipping>`,
              `      <g:country>GB</g:country>`,
              `      <g:service>Standard</g:service>`,
              `      <g:price>4.99 ${CURRENCY}</g:price>`,
              `    </g:shipping>`,
              `    <g:shipping_weight>${(p.weightGrams ?? 20)} g</g:shipping_weight>`,
              `    <g:product_highlight>${xmlEscape(purityHighlight)}</g:product_highlight>`,
              `    <g:product_highlight>Lyophilised powder format</g:product_highlight>`,
              `    <g:product_highlight>Certificate of Analysis available on request</g:product_highlight>`,
              `    <g:product_highlight>For Research Use Only — Not for Human Consumption</g:product_highlight>`,
              sizeCompact
                ? `    <g:unit_pricing_measure>${xmlEscape(sizeCompact)}</g:unit_pricing_measure>`
                : null,
              `    <g:excluded_destination>Shopping_ads</g:excluded_destination>`,
              `    <g:excluded_destination>Display_ads</g:excluded_destination>`,
              `    <g:included_destination>Free_listings</g:included_destination>`,
              `  </item>`,
            ]
              .filter(Boolean)
              .join("\n");
          })
          .join("\n");

        const xml = [
          `<?xml version="1.0" encoding="UTF-8"?>`,
          `<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">`,
          `  <channel>`,
          `    <title>${xmlEscape(`${BRAND} UK — Research Reference Standards (Free Listings)`)}</title>`,
          `    <link>${BASE_URL}</link>`,
          `    <description>Full-name research reference standards for organic Google Shopping discovery. Free listings only — not for Shopping Ads.</description>`,
          items,
          `  </channel>`,
          `</rss>`,
        ].join("\n");

        return new Response(xml, {
          status: 200,
          headers: {
            "Content-Type": "application/xml; charset=utf-8",
            "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
            "CDN-Cache-Control": "no-store",
            "Cloudflare-CDN-Cache-Control": "no-store",
            "Surrogate-Control": "no-store",
            "X-Feed-Items": String(eligible.length),
            "X-Feed-Type": "free-listings-only",
            "X-Feed-Generated-At": generatedAt,
          },
        });
      },
    },
  },
});
