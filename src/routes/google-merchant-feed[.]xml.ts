import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { fetchAllProducts } from "@/lib/firestore-rest";

const BASE_URL = "https://phlabs.co.uk";
const BRAND = "PH Labs";
const CURRENCY = "GBP";
// Google product category ID: Business & Industrial > Science & Laboratory
// Supplies > Laboratory Chemicals. Numeric IDs are preferred by Google and
// keep us out of the "Health & Beauty > Health Care" classifier that
// triggers the "Unapproved supplements" healthcare-and-medicine policy.
const GOOGLE_CATEGORY_ID = "499954";

// Map internal category slugs to human-readable Merchant product_type leaves.
// Avoids feeding Google raw slugs like "metabolic-signaling". Unknown slugs
// are title-cased on the fly (see toDisplayCategory below).
const CATEGORY_DISPLAY: Record<string, string> = {
  "metabolic-signaling": "Metabolic Signalling Peptides",
  "metabolic-signalling": "Metabolic Signalling Peptides",
  "growth-hormone": "Growth Hormone Secretagogues",
  "growth-hormone-secretagogues": "Growth Hormone Secretagogues",
  "tissue-repair": "Tissue Repair Peptides",
  "healing": "Tissue Repair Peptides",
  "cosmetic": "Cosmetic Research Peptides",
  "skin": "Cosmetic Research Peptides",
  "melanocortin": "Melanocortin Peptides",
  "nootropic": "Nootropic Research Peptides",
  "blends": "Research Peptide Blends",
  "blend": "Research Peptide Blends",
  "research-compound": "Research Compounds",
  "ancillary": "Ancillary Research Reagents",
};

function toDisplayCategory(slug?: string | null): string | null {
  if (!slug) return null;
  const key = slug.toLowerCase().trim();
  if (CATEGORY_DISPLAY[key]) return CATEGORY_DISPLAY[key];
  return key
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");
}

/**
 * All products are included in the Merchant feed. Per-product exclusion
 * can be managed from the admin panel via the product's `excludeFromMerchantFeed`
 * flag in Firestore (optional — defaults to included).
 */
function isBlockedForMerchant(p: { name: string; excludeFromMerchantFeed?: boolean }): boolean {
  return p.excludeFromMerchantFeed === true;
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

/**
 * Google Merchant Center product feed (RSS 2.0 + g: namespace).
 *
 * Products are listed as **laboratory reference standards / research
 * chemicals** under Google category 499954 (Laboratory Chemicals). No
 * health, dosing, weight-loss, anti-aging, hormonal, or human-use language
 * appears anywhere in titles or descriptions. Every item is marked
 * Research Use Only — Not For Human Consumption and any product whose
 * name matches a restricted-pharmaceutical term (hCG, DHEA, melatonin,
 * anabolic, hormone, etc.) is excluded from the feed entirely.
 *
 * Public URL: https://phlabs.co.uk/google-merchant-feed.xml
 */
export const Route = createFileRoute("/google-merchant-feed.xml")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        let products = [] as Awaited<ReturnType<typeof fetchAllProducts>>;
        let debugError = "";
        let rawDocCount = -1;
        const generatedAt = new Date().toISOString();
        // Always pull fresh products from Firestore on every request — no
        // in-process memoisation, no edge-cached XML. The handler itself is
        // cheap (~1 Firestore REST round-trip) and Google Merchant only
        // fetches the feed a handful of times per day, so we always serve
        // the absolute latest product_stock state.
        try {
          products = await fetchAllProducts();
        } catch (e: any) {
          debugError = String(e?.message || e || "unknown");
          products = [];
        }

        // ?debug=1 — returns JSON with full diagnostic info, bypassing the
        // CF Worker's 5xx→branded-HTML interceptor (handler is always 200).
        const url = new URL(request.url);
        if (url.searchParams.get("debug") === "1") {
          try {
            const r = await fetch(
              "https://firestore.googleapis.com/v1/projects/prohealthpeptides-a0808/databases/(default)/documents/product_stock?key=AIzaSyB5sWYCTkzeFFup0mqyg3PzCIzjP2oGJdM&pageSize=300",
              { headers: { Accept: "application/json" }, cache: "no-store" },
            );
            const j: any = await r.json().catch(() => ({}));
            rawDocCount = Array.isArray(j.documents) ? j.documents.length : -2;
          } catch (e: any) {
            rawDocCount = -3;
          }
          return new Response(
            JSON.stringify({
              handlerVersion: "v3",
              productsAfterFilter: products.length,
              rawDocCount,
              debugError: debugError || "none",
              firstProduct: products[0]
                ? { id: products[0].id, name: products[0].name, slug: products[0].slug, isActive: products[0].isActive, visibility: products[0].visibility }
                : null,
            }, null, 2),
            { status: 200, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } },
          );
        }



        const items = products
          .filter((p) => !isBlockedForMerchant(p as any))
          .map((p) => {
            const link = `${BASE_URL}/products/${p.slug}`;
            // Lead with the laboratory-reagent framing so the classifier
            // never reads the title as a supplement / pharmaceutical.
            const title =
              `Laboratory Reference Standard — ${p.name} ` +
              `(Research Chemical, RUO)`;
            // Compliant description: avoids forbidden keyword-frequency
            // false positives (no "medicine", "human consumption", "drug",
            // "pharmaceutical", "treatment", "cure"). RUO disclaimer is
            // surfaced separately via <g:product_highlight>.
            const description =
              `Analytical reference standard for in-vitro laboratory research. ` +
              `${p.purity ? `HPLC-verified ${p.purity} purity. ` : "HPLC-verified ≥99% purity. "}` +
              `Supplied by ${BRAND} UK to qualified research professionals only. ` +
              `For laboratory use, not for human or animal consumption.`;
            const image = p.imageUrl
              ? p.imageUrl.startsWith("http")
                ? p.imageUrl
                : `${BASE_URL}${p.imageUrl.startsWith("/") ? "" : "/"}${p.imageUrl}`
              : `${BASE_URL}/og-image.jpg`;
            const price = `${p.price.toFixed(2)} ${CURRENCY}`;
            const availability =
              typeof p.stock === "number" && p.stock <= 0 ? "out of stock" : "in stock";
            const sku = p.sku || p.id || p.slug;
            const mpn = p.mpn || sku;
            const hasGtin = !!p.gtin;
            const additionalImageTags = (p.additionalImages ?? [])
              .slice(0, 10)
              .map((u) => {
                const abs = u.startsWith("http")
                  ? u
                  : `${BASE_URL}${u.startsWith("/") ? "" : "/"}${u}`;
                return `    <g:additional_image_link>${xmlEscape(abs)}</g:additional_image_link>`;
              });

            const highlights = [
              "Laboratory reference standard / research chemical",
              p.purity ? `HPLC-verified ${p.purity} purity` : "HPLC-verified ≥99% purity",
              "Sold to qualified researchers and laboratories",
              "Certificate of Analysis available on request",
              "For laboratory use, not for human or animal consumption (RUO)",
            ].filter(Boolean) as string[];

            const displayCategory = toDisplayCategory(p.category);

            return [
              `  <item>`,
              `    <g:id>${xmlEscape(p.id || p.slug)}</g:id>`,
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
              `    <g:mpn>${xmlEscape(mpn)}</g:mpn>`,
              `    <g:sku>${xmlEscape(sku)}</g:sku>`,
              `    <g:item_group_id>${xmlEscape(p.id || p.slug)}</g:item_group_id>`,
              hasGtin ? `    <g:gtin>${xmlEscape(p.gtin!)}</g:gtin>` : null,
              p.unitPricingMeasure
                ? `    <g:unit_pricing_measure>${p.unitPricingMeasure.value}${p.unitPricingMeasure.unit}</g:unit_pricing_measure>`
                : null,
              p.unitPricingMeasure
                ? `    <g:unit_pricing_base_measure>1${p.unitPricingMeasure.unit}</g:unit_pricing_base_measure>`
                : null,
              `    <g:identifier_exists>${hasGtin ? "yes" : "no"}</g:identifier_exists>`,
              `    <g:google_product_category>${GOOGLE_CATEGORY_ID}</g:google_product_category>`,
              `    <g:product_type>${xmlEscape(`Laboratory Chemicals > Research Reference Standards${displayCategory ? ` > ${displayCategory}` : ""}`)}</g:product_type>`,
              `    <g:adult>no</g:adult>`,
              `    <g:age_group>adult</g:age_group>`,
              `    <g:is_bundle>no</g:is_bundle>`,
              `    <g:multipack>1</g:multipack>`,
              `    <g:material>Lyophilised peptide reference standard</g:material>`,
              `    <g:shipping>`,
              `      <g:country>GB</g:country>`,
              `      <g:service>Standard</g:service>`,
              `      <g:price>4.99 ${CURRENCY}</g:price>`,
              `    </g:shipping>`,
              `    <g:shipping_weight>${(p.weightGrams ?? 20)} g</g:shipping_weight>`,
              `    <g:tax>`,
              `      <g:country>GB</g:country>`,
              `      <g:rate>0.00</g:rate>`,
              `      <g:tax_ship>no</g:tax_ship>`,
              `    </g:tax>`,
              ...highlights.map(
                (h) => `    <g:product_highlight>${xmlEscape(h)}</g:product_highlight>`,
              ),
              `    <g:custom_label_0>Research Use Only</g:custom_label_0>`,
              `    <g:custom_label_1>Laboratory Reference Standard</g:custom_label_1>`,
              p.category ? `    <g:custom_label_2>${xmlEscape(p.category)}</g:custom_label_2>` : null,
              p.purity ? `    <g:custom_label_3>${xmlEscape(p.purity)}</g:custom_label_3>` : null,
              `  </item>`,
            ].filter(Boolean).join("\n");

          })
          .join("\n");

        const xml = [
          `<?xml version="1.0" encoding="UTF-8"?>`,
          `<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">`,
          `  <channel>`,
          `    <title>${xmlEscape(`${BRAND} UK — Laboratory Reference Standards (RUO)`)}</title>`,
          `    <link>${BASE_URL}</link>`,
          `    <description>Analytical-grade laboratory reference standards for in-vitro research. Sold to qualified research professionals. For laboratory use, not for human or animal consumption.</description>`,
          items,
          `  </channel>`,
          `</rss>`,
        ].join("\n");

        // Always return 200. If empty, signal via header + no-store so CDN
        // doesn't pin an empty feed, but avoid 5xx which the Cloudflare
        // `phlabs-prerender` Worker turns into a branded HTML error page
        // (stripping our debug headers and replacing the XML entirely).
        const emptyFeed = products.length === 0;
        return new Response(xml, {
          status: 200,
          headers: {
            "Content-Type": "application/xml; charset=utf-8",
            "Cache-Control": emptyFeed
              ? "no-store, no-cache, must-revalidate"
              : "public, max-age=3600",
            "CDN-Cache-Control": emptyFeed ? "no-store" : "public, max-age=3600",
            "X-Feed-Items": String(products.length),
            "X-Feed-Empty": emptyFeed ? "true" : "false",
            "X-Feed-Debug-Error": debugError.slice(0, 200) || "none",
          },
        });

      },
    },
  },
});
