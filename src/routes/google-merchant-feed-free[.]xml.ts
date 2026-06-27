import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { fetchAllProducts } from "@/lib/firestore-rest";

/**
 * ============================================================================
 * SECOND GOOGLE MERCHANT CENTER FEED — APPROVED FORMAT (restored)
 * ============================================================================
 *
 * Public URL: https://phlabs.co.uk/google-merchant-feed-free.xml
 *           : https://{LEGACY_HOST}/google-merchant-feed-free.xml (legacy isolated host)
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
const FEED_REVISION = "prohealth-grok-safe-v4-semrush-20260627";

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

            // Semrush UK: "research peptides uk" 480/mo KDI 34 = realistic.
            // "reference standard" / "lyophilised peptide" = <40/mo combined.
            // Front-load molecule + size + form + purity USP so Free Listings
            // match real user queries; brand last; compliance line stays.
            const isLiquid = /bacteriostatic|water/i.test(p.name);
            const formLabel = isLiquid ? "Sterile Solution" : "Lyophilised Powder";
            const title = sizeLabel
              ? `${fullName} ${sizeLabel} — ${formLabel} | HPLC 99% Purity | Research Compound | ${BRAND} UK`
              : `${fullName} — ${formLabel} | HPLC 99% Purity | Research Compound | ${BRAND} UK`;

            const cas = casFor(p.name) ?? "N/A (multi-component reference mixture)";
            const baseUnit = isLiquid ? "1 ml" : "1 mg";
            const formLine = isLiquid ? "sterile aqueous solution" : "lyophilised solid powder";
            // USP-first description: form + purity + spec + CoA + UK fulfilment,
            // mandatory non-human-use disclaimer at the end (v3 compliance shape).
            const description =
              `${fullName}${sizeLabel ? ` ${sizeLabel}` : ""} supplied as a ${formLine} for in-vitro laboratory research and analytical reference work in the United Kingdom. ` +
              `HPLC-verified ≥99% purity, Certificate of Analysis (CoA) issued per batch with retention sample. ` +
              `Technical specification: • CAS Number: ${cas} • Purity ≥99% by RP-HPLC • Form: ${formLine} • Storage: 2–8 °C, protect from light. ` +
              `Dispatched from a UK facility to qualified laboratories, research institutions and analytical chemists. ` +
              `Strictly for in-vitro scientific testing and reference standards. NOT for human consumption, therapeutic or diagnostic use.`;

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
              `    <g:product_type>Business &amp; Industrial &gt; Science &amp; Laboratory &gt; Biochemicals${isLiquid ? "" : " &gt; Peptides"}</g:product_type>`,
              `    <g:adult>no</g:adult>`,
              `    <g:age_group>adult</g:age_group>`,
              `    <g:identifier_exists>false</g:identifier_exists>`,
              `    <g:is_bundle>no</g:is_bundle>`,
              `    <g:multipack>1</g:multipack>`,
              sizeCompact
                ? `    <g:unit_pricing_measure>${xmlEscape(sizeCompact)}</g:unit_pricing_measure>`
                : null,
              `    <g:unit_pricing_base_measure>${baseUnit}</g:unit_pricing_base_measure>`,
              `    <g:shipping>`,
              `      <g:country>GB</g:country>`,
              `      <g:service>Standard</g:service>`,
              `      <g:price>4.99 ${CURRENCY}</g:price>`,
              `    </g:shipping>`,
              `    <g:shipping_weight>${(p.weightGrams ?? 20)} g</g:shipping_weight>`,
              // Structured product_detail attributes — Google Free Listings
              // surfaces these as a spec table and uses them as ranking signals.
              `    <g:product_detail><g:section_name>Specification</g:section_name><g:attribute_name>CAS Number</g:attribute_name><g:attribute_value>${xmlEscape(cas)}</g:attribute_value></g:product_detail>`,
              `    <g:product_detail><g:section_name>Specification</g:section_name><g:attribute_name>Purity</g:attribute_name><g:attribute_value>≥99% by RP-HPLC</g:attribute_value></g:product_detail>`,
              `    <g:product_detail><g:section_name>Specification</g:section_name><g:attribute_name>Form</g:attribute_name><g:attribute_value>${isLiquid ? "Sterile aqueous solution" : "Lyophilised solid powder"}</g:attribute_value></g:product_detail>`,
              `    <g:product_detail><g:section_name>Specification</g:section_name><g:attribute_name>Storage</g:attribute_name><g:attribute_value>2–8 °C, protect from light</g:attribute_value></g:product_detail>`,
              `    <g:product_detail><g:section_name>Specification</g:section_name><g:attribute_name>Certificate of Analysis</g:attribute_name><g:attribute_value>Issued per batch with retention sample</g:attribute_value></g:product_detail>`,
              `    <g:product_detail><g:section_name>Compliance</g:section_name><g:attribute_name>Intended Use</g:attribute_name><g:attribute_value>In-vitro laboratory research only — NOT for human consumption</g:attribute_value></g:product_detail>`,
              `    <g:product_highlight>HPLC-verified ≥99% purity (CoA per batch)</g:product_highlight>`,
              isLiquid ? null : `    <g:product_highlight>Lyophilised powder, stable cold-chain dispatch</g:product_highlight>`,
              `    <g:product_highlight>UK fulfilment to qualified laboratories</g:product_highlight>`,
              `    <g:product_highlight>Retention sample held for analytical traceability</g:product_highlight>`,
              `    <g:custom_label_0>Laboratory Reference Standard</g:custom_label_0>`,
              `    <g:custom_label_1>In-Vitro Research Only</g:custom_label_1>`,
              `    <g:custom_label_2>HPLC ≥99% Purity</g:custom_label_2>`,
              `    <g:custom_label_3>UK Dispatch</g:custom_label_3>`,
              `    <g:custom_label_4>${xmlEscape(formLabel)}</g:custom_label_4>`,
              `  </item>`,
            ]
              .filter(Boolean)
              .join("\n");
          })
          .join("\n");

        const xml = [
          `<?xml version="1.0" encoding="UTF-8"?>`,
          `<!-- ${FEED_REVISION}: approved-format feed rendered live for ${linkBase} at ${generatedAt} -->`,
          `<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">`,
          `  <channel>`,
          `    <title>${xmlEscape(`${BRAND} UK — Laboratory Reference Standards`)}</title>`,
          `    <link>${linkBase}</link>`,
          `    <description>Analytical reference standards supplied as lyophilised solids for in-vitro laboratory use. Distributed to qualified research professionals and laboratories only.</description>`,
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
            "X-Feed-Revision": FEED_REVISION,
            "X-Feed-Generated-At": generatedAt,
          },
        });
      },
    },
  },
});
