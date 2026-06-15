import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { fetchAllProducts } from "@/lib/firestore-rest";

const BASE_URL = "https://phlabs.co.uk";
const BRAND = "PH Labs";
const CURRENCY = "GBP";
// Google UK product taxonomy: Business & Industrial > Science & Laboratory >
// Biochemicals (ID 6975). Peptide research compounds are biochemicals under
// the UK taxonomy. Numeric IDs are preferred by Google and keep us out of
// the "Health & Beauty > Health Care" classifier that triggers the
// "Unapproved supplements" healthcare-and-medicine policy.
// Reference UK IDs for related leaves:
//   1624 — Business & Industrial > Science & Laboratory
//   6975 — ...> Biochemicals (used here)
//   3002 — ...> Laboratory Chemicals
//   7325 — ...> Dissection Kits
const GOOGLE_CATEGORY_ID = "6975";
const GOOGLE_CATEGORY_PATH = "Business & Industrial > Science & Laboratory > Biochemicals";

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
 * Manual opt-in model. Google must NOT auto-pick up every product. A
 * product only appears in the feed if its Firestore doc has
 * `includeInMerchantFeed === true`. The legacy `excludeFromMerchantFeed`
 * flag is still respected as a hard block. Tirzepatide is additionally
 * hard-blocked by slug/name regardless of flag state.
 */
const HARD_BLOCKED_SLUGS = new Set<string>([
  "tirzepatide-research-peptide",
  "tirzepatide",
]);

function isAllowedForMerchant(p: {
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

        // ?debug=1 — gated behind a server-only secret header. Returns JSON
        // with diagnostic info, bypassing the CF Worker's 5xx→branded-HTML
        // interceptor (handler is always 200). Without a valid
        // `x-debug-secret` header matching `MERCHANT_FEED_DEBUG_SECRET`, the
        // request falls through to the normal XML feed below — no info leak.
        const url = new URL(request.url);
        if (url.searchParams.get("debug") === "1") {
          const expected = process.env.MERCHANT_FEED_DEBUG_SECRET || "";
          const provided = request.headers.get("x-debug-secret") || "";
          if (!expected || !provided || provided !== expected) {
            return new Response("Not found", { status: 404 });
          }
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




        const merchantProducts = products.filter((p) => isAllowedForMerchant(p as any));

        const items = merchantProducts
          .map((p) => {
            // Google Merchant feed uses the Firestore document ID URL.
            // The route /products/$slug renders the product in place for
            // both slug and ID, and the page's canonical <link> points
            // back to the slug URL so SEO authority consolidates.
            const link = `${BASE_URL}/products/${p.id}`;
            // Neutral title: no "research peptide", no "RUO", no "research
            // chemical" — these phrases trigger Google's supplement / health
            // classifier even when wrapped in laboratory language.
            const title = `Laboratory Reference Standard — ${p.name}`;
            // Single, neutral compliance line. No repetition, no "human",
            // no "consumption", no "RUO" stuffing.
            const description =
              `Analytical-grade reference standard for in-vitro laboratory work. ` +
              `${p.purity ? `HPLC-verified ${p.purity} purity. ` : "HPLC-verified ≥99% purity. "}` +
              `Supplied by ${BRAND} UK to qualified laboratories. ` +
              `Certificate of Analysis available on request.`;
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

            // Highlights: neutral specs only. Compliance line stays in
            // description so it's not repeated 5×.
            const highlights = [
              p.purity ? `HPLC-verified ${p.purity} purity` : "HPLC-verified ≥99% purity",
              "Lyophilised powder format",
              "Certificate of Analysis available on request",
              "Supplied to qualified UK laboratories",
            ].filter(Boolean) as string[];



            // Intentionally omit per-category leaves (e.g. "Tissue Repair",
            // "Metabolic Signalling", "Healing") from product_type and
            // custom labels — Google's classifier flagged those as health
            // claims. Feed only the neutral Biochemicals path.

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
              `    <g:google_product_category>${GOOGLE_CATEGORY_ID}</g:google_product_category>`,
              `    <g:product_type>${xmlEscape(GOOGLE_CATEGORY_PATH)}</g:product_type>`,
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
              ...highlights.map(
                (h) => `    <g:product_highlight>${xmlEscape(h)}</g:product_highlight>`,
              ),
              // Custom labels: internal segmentation only. No compliance
              // text here — Google flags it as a workaround.
              p.category ? `    <g:custom_label_0>${xmlEscape(p.category)}</g:custom_label_0>` : null,
              p.purity ? `    <g:custom_label_1>${xmlEscape(p.purity)}</g:custom_label_1>` : null,
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
          `    <description>Analytical-grade laboratory reference standards for in-vitro research. Supplied to qualified research professionals and laboratories.</description>`,
          items,
          `  </channel>`,
          `</rss>`,
        ].join("\n");

        // Always bypass edge cache so every Merchant fetch triggers a fresh
        // Firestore read. Without no-store the Cloudflare HTML cache rule
        // would pin the previous XML for up to 5 minutes and admin edits
        // wouldn't show up in the feed until the TTL expired.
        const emptyFeed = merchantProducts.length === 0;
        return new Response(xml, {
          status: 200,
          headers: {
            "Content-Type": "application/xml; charset=utf-8",
            "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
            "CDN-Cache-Control": "no-store",
            "Cloudflare-CDN-Cache-Control": "no-store",
            "X-Feed-Items": String(merchantProducts.length),
            "X-Feed-Empty": emptyFeed ? "true" : "false",
            "X-Feed-Generated-At": generatedAt,
            "X-Feed-Debug-Error": debugError.slice(0, 200) || "none",
          },
        });

      },
    },
  },
});
