import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { fetchAllProducts } from "@/lib/firestore-rest";

const BASE_URL = "https://www.phlabs.co.uk";
const BRAND = "PH Labs";
const CURRENCY = "GBP";
const GOOGLE_CATEGORY = "Business & Industrial > Science & Laboratory";

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
 * All titles, descriptions and categories are RUO-compliant: no health,
 * dosing, or human-use language. Each entry is flagged as a laboratory
 * reagent for Research Use Only — Not For Human Consumption.
 *
 * Public URL: https://www.phlabs.co.uk/google-merchant-feed.xml
 */
export const Route = createFileRoute("/google-merchant-feed.xml")({
  server: {
    handlers: {
      GET: async () => {
        let products = [] as Awaited<ReturnType<typeof fetchAllProducts>>;
        try {
          products = await fetchAllProducts();
        } catch {
          products = [];
        }

        const items = products
          .map((p) => {
            const link = `${BASE_URL}/products/${p.slug}`;
            const title = `${p.name}${p.purity ? ` ${p.purity}` : ""} — Research Use Only (RUO)`;
            const description =
              `Synthetic peptide laboratory reagent supplied by ${BRAND} UK for in-vitro research use only. ` +
              `${p.purity ? `HPLC-verified purity ${p.purity}. ` : ""}` +
              `Not for human or veterinary consumption. Not a drug, food or supplement. ` +
              `Sold strictly to qualified researchers and laboratories.`;
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
              p.purity ? `HPLC-verified purity ${p.purity}` : null,
              "Research Use Only (RUO) — not for human consumption",
              "Synthetic peptide laboratory reagent",
              "Sold to qualified researchers and laboratories",
              "Certificate of Analysis available",
            ].filter(Boolean) as string[];

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
              `    <g:google_product_category>${xmlEscape(GOOGLE_CATEGORY)}</g:google_product_category>`,
              `    <g:product_type>${xmlEscape(`Laboratory Reagents > Research Peptides${p.category ? ` > ${p.category}` : ""}`)}</g:product_type>`,
              `    <g:adult>no</g:adult>`,
              `    <g:age_group>adult</g:age_group>`,
              `    <g:gender>unisex</g:gender>`,
              `    <g:is_bundle>no</g:is_bundle>`,
              `    <g:multipack>1</g:multipack>`,
              `    <g:material>Synthetic peptide</g:material>`,
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
              `    <g:custom_label_1>Not For Human Consumption</g:custom_label_1>`,
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
          `    <title>${xmlEscape(`${BRAND} UK — Laboratory Reagents (RUO)`)}</title>`,
          `    <link>${BASE_URL}</link>`,
          `    <description>Synthetic peptide laboratory reagents for Research Use Only. Not for human consumption.</description>`,
          items,
          `  </channel>`,
          `</rss>`,
        ].join("\n");

        return new Response(xml, {
          headers: {
            "Content-Type": "application/xml; charset=utf-8",
            "Cache-Control": "public, max-age=3600",
          },
        });
      },
    },
  },
});
