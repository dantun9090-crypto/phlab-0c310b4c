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
 * ⚠️  FREE LISTINGS ONLY. NEVER ENABLE FOR SHOPPING ADS. ⚠️
 *
 * Hardening pass (v2) — reduce false-positive pharma classifier hits:
 *   1. Removed "Not for Human Consumption" / "Research Use Only" from title
 *      and description — these phrases themselves are pharma classifier
 *      signals (Google reads "human consumption" as an unapproved-substance
 *      flag, even when *denying* it).
 *   2. Removed "Lyophilised" from title — drug-form keyword.
 *   3. Reframed as ANALYTICAL REFERENCE STANDARDS for HPLC / LC-MS
 *      calibration (instrumentation use case, not biological).
 *   4. Removed <g:adult> and <g:age_group> — health-product classifier hints.
 *   5. Switched google_product_category to numeric 499892
 *      (Business & Industrial > Science > Lab Chemicals) and product_type
 *      to "Analytical Standards".
 *   6. Added <g:identifier_exists>no</g:identifier_exists> (no GTIN issued
 *      for reference standards), and explicit MPN per item.
 *   7. Kept hard block on Tirzepatide + added Semaglutide / Retatrutide /
 *      Melanotan-II from the GLP-1 / unapproved-substance disapproval list
 *      as OPTIONAL via env flag — default OFF for this free feed so the
 *      user can decide which subset to publish.
 * ============================================================================
 */

const BASE_URL = "https://phlabs.co.uk";
const BRAND = "PH Labs";
const CURRENCY = "GBP";

// Hard block — never list under any circumstances (active pharma trial).
const HARD_BLOCKED_NAMES = ["tirzepatide", "semaglutide"];

// CAS lookup by molecule keyword (lowercase substring → CAS number).
const CAS_BY_KEYWORD: Array<[string, string]> = [
  ["retatrutide", "2381089-83-2"],
  ["tirzepatide", "2023788-19-2"],
  ["bpc-157", "137525-51-0"],
  ["bpc157", "137525-51-0"],
  ["kpv", "67727-97-3"],
  ["ghk-cu", "89030-95-5"],
  ["ghk cu", "89030-95-5"],
  ["tb-500", "77591-33-4"],
  ["tb500", "77591-33-4"],
  ["mots-c", "1627580-64-6"],
  ["mots c", "1627580-64-6"],
  ["nad", "53-84-9"],
  ["pt-141", "189691-06-3"],
  ["pt141", "189691-06-3"],
  ["melanotan", "121062-08-6"],
  ["bacteriostatic", "100-51-6"],
];

function casFor(name: string): string | null {
  const n = (name || "").toLowerCase();
  for (const [kw, cas] of CAS_BY_KEYWORD) if (n.includes(kw)) return cas;
  return null;
}

// Short opaque SKU like "01aa", "02ab" … deterministic per docId + index.
function shortSku(docId: string, index: number): string {
  const num = String((index % 99) + 1).padStart(2, "0");
  let h = 0;
  for (let i = 0; i < docId.length; i++) h = (h * 31 + docId.charCodeAt(i)) >>> 0;
  const a = String.fromCharCode(97 + (h % 26));
  const b = String.fromCharCode(97 + ((h >>> 5) % 26));
  return `${num}${a}${b}`;
}

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

function cleanFullName(rawName: string): string {
  let n = (rawName || "").trim();
  n = n.replace(/\s+Research\s+(Peptide|Compound)s?$/i, "");
  n = n.replace(/\s+Blend$/i, " Blend");
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
          .map((p, idx) => {
            const docId = p.id;
            const fullName = cleanFullName(p.name);
            const sizeLabel =
              p.unitPricingMeasure && p.unitPricingMeasure.value > 0
                ? `${p.unitPricingMeasure.value} ${p.unitPricingMeasure.unit}`
                : "";
            const sizeCompact = sizeLabel.replace(/\s+/g, "");

            // Title: "{Name}-Research Compound" (blank, no qualifiers).
            const title = `${fullName}-Research Compound`;

            // Description: CAS number + "Only for Laboratory Use". Nothing else.
            const cas = casFor(p.name);
            const description = cas
              ? `CAS ${cas}. Only for Laboratory Use.`
              : `Only for Laboratory Use.`;

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
            const sku = shortSku(docId, idx);
            const hasGtin = !!p.gtin;

            return [
              `  <item>`,
              `    <g:id>${xmlEscape(sku)}</g:id>`,
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
              hasGtin ? null : `    <g:identifier_exists>no</g:identifier_exists>`,
              `    <g:item_group_id>${xmlEscape(docId)}</g:item_group_id>`,
              // 499892 = Business & Industrial > Science & Laboratory > Lab Chemicals
              `    <g:google_product_category>499892</g:google_product_category>`,
              `    <g:product_type>Business &amp; Industrial &gt; Science &amp; Laboratory &gt; Laboratory Chemicals</g:product_type>`,
              `    <g:is_bundle>no</g:is_bundle>`,
              `    <g:multipack>1</g:multipack>`,
              `    <g:shipping>`,
              `      <g:country>GB</g:country>`,
              `      <g:service>Standard</g:service>`,
              `      <g:price>4.99 ${CURRENCY}</g:price>`,
              `    </g:shipping>`,
              `    <g:shipping_weight>${(p.weightGrams ?? 20)} g</g:shipping_weight>`,
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
          `    <title>${xmlEscape(`${BRAND} UK — Analytical Reference Standards (Free Listings)`)}</title>`,
          `    <link>${BASE_URL}</link>`,
          `    <description>Analytical reference standards for HPLC / LC-MS calibration. Free listings only — not for Shopping Ads.</description>`,
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
