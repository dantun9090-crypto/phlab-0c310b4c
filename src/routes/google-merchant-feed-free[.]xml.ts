import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { fetchAllProducts } from "@/lib/firestore-rest";

/**
 * ============================================================================
 * SECOND GOOGLE MERCHANT CENTER FEED — APPROVED FORMAT (restored)
 * ============================================================================
 *
 * Public URL: https://phlabs.co.uk/google-merchant-feed-free.xml
 *           : https://prohealthpeptides.co.uk/google-merchant-feed-free.xml
 *
 * ⚠️  FREE LISTINGS ONLY. NEVER ENABLE FOR SHOPPING ADS. ⚠️
 *
 * Shape locked to the previously fully-approved feed:
 *   - Title:        "{Name} {size} — Analytical Reference Standard | PH Labs"
 *   - Description:  "For laboratory and analytical research only. Strictly for
 *                    in-vitro scientific testing and reference standards.
 *                    Technical specification: • CAS Number: {cas}"
 *   - product_category 6975, product_type "Biochemicals"
 *   - Includes adult=no, age_group=adult
 *   - product_highlight × 4 (HPLC purity, Lyophilised, CoA, UK labs)
 *   - custom_label_0 = "99%+"
 *   - SKU/MPN = stable short prefix per molecule (RET-001, KPV-001, …)
 *   - g:id = Firestore docId (so GMC history maps cleanly)
 * ============================================================================
 */

const BASE_URL = "https://phlabs.co.uk";
// check-domains-allow-next-line: legacy isolated host for Free-Listings GMC
const LEGACY_HOST = "prohealthpeptides.co.uk";
const LEGACY_BASE_URL = `https://${LEGACY_HOST}`;
const BRAND = "PH Labs";
const CURRENCY = "GBP";

// Hard block — never list (active pharma trial / disapproved molecules).
const HARD_BLOCKED_NAMES = ["tirzepatide", "semaglutide"];

// CAS lookup by molecule keyword (lowercase substring → CAS number).
const CAS_BY_KEYWORD: Array<[string, string]> = [
  ["retatrutide", "2381089-83-2"],
  ["tirzepatide", "2023788-19-2"],
  ["bpc-157", "137525-51-0"],
  ["bpc157", "137525-51-0"],
  ["kpv", "67727-97-3"],
  ["ghk-cu", "49557-75-7"],
  ["ghk cu", "49557-75-7"],
  ["tb-500", "77591-33-4"],
  ["tb500", "77591-33-4"],
  ["mots-c", "1627580-64-6"],
  ["motsc", "1627580-64-6"],
  ["mots c", "1627580-64-6"],
  ["nad", "53-84-9"],
  ["pt-141", "189691-06-3"],
  ["pt141", "189691-06-3"],
  ["melanotan", "121062-08-6"],
  ["bacteriostatic", "100-51-6"],
];

// SKU prefix map (matches the previously approved feed).
const SKU_PREFIX_BY_KEYWORD: Array<[string, string]> = [
  ["retatrutide", "RET-001"],
  ["kpv", "KPV-001"],
  ["motsc", "MOT-001"],
  ["mots-c", "MOT-001"],
  ["mots c", "MOT-001"],
  ["bpc-157", "PHP-157"],
  ["bpc157", "PHP-157"],
  ["tb-500", "TB5-001"],
  ["tb500", "TB5-001"],
  ["pt-141", "PT141-001"],
  ["pt141", "PT141-001"],
  ["nad", "NAD-001"],
  ["ghk-cu", "GHK-001"],
  ["ghk cu", "GHK-001"],
  ["glow", "GLOW-001"],
  ["klow", "KLOW-001"],
  ["melanotan", "MEL-001"],
  ["bacteriostatic", "BAC-001"],
];

function casFor(name: string): string | null {
  const n = (name || "").toLowerCase();
  for (const [kw, cas] of CAS_BY_KEYWORD) if (n.includes(kw)) return cas;
  return null;
}

function skuFor(name: string, docId: string): string {
  const n = (name || "").toLowerCase();
  for (const [kw, sku] of SKU_PREFIX_BY_KEYWORD) if (n.includes(kw)) return sku;
  // Fallback: short stable code from docId.
  let h = 0;
  for (let i = 0; i < docId.length; i++) h = (h * 31 + docId.charCodeAt(i)) >>> 0;
  return `PHL-${String(h % 9000 + 1000)}`;
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
  return n;
}

function isAllowedForFreeListing(p: {
  name?: string;
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
      GET: async ({ request }) => {
        const reqHost = (() => {
          try {
            return new URL(request.url).hostname.toLowerCase();
          } catch {
            return "";
          }
        })();
        const linkBase = reqHost === LEGACY_HOST ? LEGACY_BASE_URL : BASE_URL;

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

            const title = sizeLabel
              ? `${fullName} ${sizeLabel} — Analytical Reference Standard | ${BRAND}`
              : `${fullName} — Analytical Reference Standard | ${BRAND}`;

            const cas = casFor(p.name) ?? "N/A (multi-component reference mixture)";
            const description = `For laboratory and analytical research only. Strictly for in-vitro scientific testing and reference standards. Technical specification: • CAS Number: ${cas}`;

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

            const link = `${linkBase}/products/${docId}`;
            const price = `${p.price.toFixed(2)} ${CURRENCY}`;
            const availability =
              typeof p.stock === "number" && p.stock <= 0 ? "out of stock" : "in stock";
            const sku = skuFor(p.name, docId);

            return [
              `  <item>`,
              `    <g:id>${xmlEscape(docId)}</g:id>`,
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
              `    <g:item_group_id>${xmlEscape(docId)}</g:item_group_id>`,
              `    <g:google_product_category>6975</g:google_product_category>`,
              `    <g:product_type>Business &amp; Industrial &gt; Science &amp; Laboratory &gt; Biochemicals</g:product_type>`,
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
              `    <g:product_highlight>HPLC-verified 99%+ purity</g:product_highlight>`,
              `    <g:product_highlight>Lyophilised powder format</g:product_highlight>`,
              `    <g:product_highlight>Certificate of Analysis available on request</g:product_highlight>`,
              `    <g:product_highlight>Supplied to qualified UK laboratories</g:product_highlight>`,
              `    <g:custom_label_0>99%+</g:custom_label_0>`,
              sizeCompact
                ? `    <g:unit_pricing_measure>${xmlEscape(sizeCompact)}</g:unit_pricing_measure>`
                : null,
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
          `    <title>${xmlEscape(`${BRAND} UK — Laboratory Reference Standards`)}</title>`,
          `    <link>${linkBase}</link>`,
          `    <description>Analytical reference standards supplied as lyophilised solids for in-vitro laboratory use. Distributed to qualified research professionals and laboratories.</description>`,
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
            "X-Feed-Revision": "free-approved-shape-v1",
            "X-Feed-Generated-At": generatedAt,
          },
        });
      },
    },
  },
});
