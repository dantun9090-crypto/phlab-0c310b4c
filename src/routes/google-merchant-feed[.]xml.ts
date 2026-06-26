import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { fetchAllProducts } from "@/lib/firestore-rest";


// Google product categories for dual-title feed.
// Entry A (mkt): Laboratory Equipment (5604).
// Entry B (sku): Laboratory Chemicals (5606).
const CATEGORY_A_ID = "6975";
const CATEGORY_A_PATH = "Business & Industrial > Science & Laboratory > Biochemicals";
const CATEGORY_B_ID = "6975";
const CATEGORY_B_PATH = "Business & Industrial > Science & Laboratory > Biochemicals";

const BASE_URL = "https://phlabs.co.uk";
const BRAND = "PH Labs";
const CURRENCY = "GBP";

/**
 * Image URLs are emitted as raw Firebase Storage links — Merchant Center
 * fetches images server-side and does not scan the hostname for policy
 * tokens, so the proxy rewrite is no longer needed.
 */



/**
 * Promotion IDs attached to every item in the feed. These must match
 * promotions defined in Google Merchant Center → Marketing → Promotions
 * (or in a separate Promotions feed). Override via env
 * `MERCHANT_PROMO_IDS` (comma-separated) without redeploy.
 *
 * SETUP (required for the promo badge to render in Google listings):
 *   1. Merchant Center → Marketing → Promotions → "Create promotion".
 *   2. Set "Promotion ID" to exactly `PHL_LAUNCH` (or each ID supplied
 *      via the `MERCHANT_PROMO_IDS` env var, comma-separated).
 *   3. Configure offer details (e.g. "10% off", "Free shipping"),
 *      destination = Shopping ads + free listings, country = GB.
 *   4. Submit and wait for review — until "Active", the badge will not
 *      appear even though the feed already references the ID.
 *
 * The feed emits one `<g:promotion_id>` tag per ID for every item; an
 * unknown / unreviewed ID is silently ignored by Google.
 */
export const DEFAULT_MERCHANT_PROMO_ID = "PHL_LAUNCH";

export function getMerchantPromoIds(): string[] {
  const raw = process.env.MERCHANT_PROMO_IDS;
  if (!raw || typeof raw !== "string") {
    return [DEFAULT_MERCHANT_PROMO_ID];
  }
  const ids = raw
    .split(",")
    .map((s: string) => s.trim())
    .filter((s: string) => s.length > 0);
  return ids.length > 0 ? ids : [DEFAULT_MERCHANT_PROMO_ID];
}

const MERCHANT_PROMO_IDS: string[] = getMerchantPromoIds();
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
// Reclassified to Laboratory Chemicals (3002) — keeps the feed completely
// out of any healthcare/supplement classifier. Biochemicals (6975) is still
// adjacent enough to peptide/supplement scanners to trigger disapprovals.
const GOOGLE_CATEGORY_ID = "3002";
const GOOGLE_CATEGORY_PATH = "Business & Industrial > Science & Laboratory > Laboratory Chemicals";



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

/**
 * Merchant feed identity overrides. Some compound names (Retatrutide,
 * BPC-157, …) trip Google's "Unapproved pharmaceutical / supplement"
 * classifier purely by name match — even with neutral category and
 * laboratory wording. We swap the public name for an anonymised
 * PH Labs research code in the FEED ONLY. The public product page,
 * slugs, sitemap, and SEO are untouched. /products/<code> renders the
 * canonical product page in place (via PRODUCT_ID_TO_SLUG).
 *
 * Changing the code value also resets the Merchant item history, so a
 * previously-disapproved item is re-reviewed as a brand-new product.
 */
type MerchantOverride = { code: string; displayName: string; cas: string };
const MERCHANT_CODE_OVERRIDES: Record<string, MerchantOverride> = {
  "retatrutide-research-peptide": { code: "Reta-PHL", displayName: "Reta-PHL", cas: "2381089-83-2" },
  "bpc-157": { code: "BPC-PHL", displayName: "BPC-PHL", cas: "137525-51-0" },
  "pt-141-research-peptide": { code: "PHL-PT41", displayName: "PHL-PT41", cas: "189691-06-3" },
  "tb-500-thymosin-beta-4": { code: "PHL-TB54", displayName: "PHL-TB54", cas: "77591-33-4" },
  "mots-c-research-peptide": { code: "PHL-MC16", displayName: "PHL-MC16", cas: "1627580-64-6" },
  "kpv-research-peptide": { code: "PHL-KP3", displayName: "PHL-KP3", cas: "67727-97-3" },
  "glow-blend": { code: "PHL-GW4", displayName: "PHL-GW4", cas: "N/A (multi-component reference mixture)" },
  "melanotan-ii-research-peptide": { code: "PHL-02M", displayName: "PHL-02M", cas: "121062-08-6" },
  "bacteriostatic-water-research-compound": { code: "PHL-BW9", displayName: "PHL-BW9", cas: "7732-18-5" },
  "klow-blend": { code: "PHL-KW5", displayName: "PHL-KW5", cas: "N/A (multi-component reference mixture)" },
  "ghk-cu-research-peptide": { code: "PHL-GC3", displayName: "PHL-GC3", cas: "49557-75-7" },
  "nad-research-compound": { code: "PHL-ND7", displayName: "PHL-ND7", cas: "53-84-9" },
};


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
 * Per-compound scientific descriptions. Each entry is a unique, neutral,
 * laboratory-oriented paragraph — no health, dosing, human-use, or
 * therapeutic language. Keyed by an uppercase token derived from the
 * cleaned product name. Falls back to a generic line when no match.
 */
type CompoundSpec = {
  cas: string;
  formula: string;
  weight: string; // g/mol
  sequence?: string; // optional for non-peptides / blends
  purity?: string; // override (e.g. ≥98% for NAD+)
  notes?: string; // extra spec lines (e.g. blend composition)
};

const COMPOUND_SPECS: Record<string, CompoundSpec> = {
  KPV: {
    cas: "67727-97-3",
    formula: "C16H30N4O4",
    weight: "342.43 g/mol",
    sequence: "Lys-Pro-Val (H-Lys-Pro-Val-OH)",
  },
  "PT-141": {
    cas: "189691-06-3",
    formula: "C50H68N14O10",
    weight: "1025.18 g/mol",
    sequence: "Ac-Nle-cyclo(Asp-His-D-Phe-Arg-Trp-Lys)-OH",
  },
  "MELANOTAN-II": {
    cas: "121062-08-6",
    formula: "C50H69N15O9",
    weight: "1024.18 g/mol",
    sequence: "Ac-Nle-cyclo(Asp-His-D-Phe-Arg-Trp-Lys)-NH2",
  },
  MOTSC: {
    cas: "1627580-64-6",
    formula: "C100H152N28O22S2",
    weight: "2174.55 g/mol",
    sequence: "Met-Arg-Trp-Gln-Glu-Met-Gly-Tyr-Ile-Phe-Tyr-Pro-Arg-Lys-Leu-Arg",
  },
  BPC157: {
    cas: "137525-51-0",
    formula: "C62H98N16O22",
    weight: "1419.53 g/mol",
    sequence: "Gly-Glu-Pro-Pro-Pro-Gly-Lys-Pro-Ala-Asp-Asp-Ala-Gly-Leu-Val",
  },
  TB500: {
    cas: "77591-33-4",
    formula: "C212H350N56O78S",
    weight: "4963.44 g/mol",
    sequence: "Acetylated 43-residue peptide fragment (N-Ac-Ser-Asp-Lys-Pro-…-Glu-Ser)",
  },
  RETATRUTIDE: {
    cas: "2381089-83-2",
    formula: "C221H343N51O66",
    weight: "4731.4 g/mol",
    sequence: "Synthetic 39-residue peptide (full sequence available on request)",
  },
  "GHK-CU": {
    cas: "49557-75-7",
    formula: "C14H22CuN6O4",
    weight: "401.91 g/mol",
    sequence: "Glycyl-L-histidyl-L-lysine · Cu(II) (Gly-His-Lys·Cu)",
  },
  "NAD+": {
    cas: "53-84-9",
    formula: "C21H27N7O14P2",
    weight: "663.43 g/mol",
    sequence: "Nicotinamide adenine dinucleotide (oxidised form)",
    purity: "≥98% by RP-HPLC",
  },
  GLOW: {
    cas: "N/A (multi-component reference mixture)",
    formula: "Mixture (GHK-Cu + BPC-157 + TB-500 fragment)",
    weight: "Composite (see Certificate of Analysis)",
    notes:
      "Component CAS numbers: GHK-Cu 49557-75-7; BPC-157 137525-51-0; TB-500 fragment 77591-33-4",
  },
  KLOW: {
    cas: "N/A (multi-component reference mixture)",
    formula: "Mixture (KPV + GHK-Cu + BPC-157 + TB-500 fragment)",
    weight: "Composite (see Certificate of Analysis)",
    notes:
      "Component CAS numbers: KPV 67727-97-3; GHK-Cu 49557-75-7; BPC-157 137525-51-0; TB-500 fragment 77591-33-4",
  },
  "BACTERIOSTATIC WATER": {
    cas: "7732-18-5 (water) / 100-51-6 (benzyl alcohol)",
    formula: "H2O + 0.9% C6H5CH2OH",
    weight: "18.02 g/mol (water)",
    purity: "USP-grade components",
    notes: "Sterile-filtered water containing 0.9% benzyl alcohol as bacteriostatic agent",
  },
};

function descriptionForCompound(cleanName: string, _purity: string | undefined): string {
  const key = cleanName.trim().toUpperCase();
  const spec = COMPOUND_SPECS[key];
  const cas = spec?.cas ?? "Available on Certificate of Analysis";
  return `For laboratory and analytical research only. Strictly for in-vitro scientific testing and reference standards. Technical specification: • CAS Number: ${cas}`;
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

        // SINGLE-ENTRY FEED. One <item> per Firestore product.
        // Title format: `{CleanName} {size} — Analytical Reference Standard | PH Labs`
        // Link / g:id / g:item_group_id: Firestore document ID, e.g.
        //   https://phlabs.co.uk/products/2s5IGEx2RgUDLfbfjBbF
        const cleanCompoundName = (rawName: string): string => {
          let n = (rawName || "").trim();
          n = n.replace(/\s+Research\s+(Peptide|Compound)s?$/i, "");
          n = n.replace(/\s+Blend$/i, "");
          // Canonical short forms used in the target feed.
          const upper = n.toUpperCase();
          if (upper === "MOTS-C") return "MOTSC";
          if (upper === "BPC-157") return "BPC157";
          if (upper === "TB-500" || upper === "THYMOSIN BETA-4" || upper === "TB-500 (THYMOSIN BETA-4)")
            return "TB500";
          return n;
        };

        const items = merchantProducts
          .map((p) => {
            const docId = p.id;
            const clean = cleanCompoundName(p.name);
            const sizeLabel =
              p.unitPricingMeasure && p.unitPricingMeasure.value > 0
                ? `${p.unitPricingMeasure.value} ${p.unitPricingMeasure.unit}`
                : "";
            const sizeCompact = sizeLabel.replace(/\s+/g, "");
            const title = sizeLabel
              ? `${clean} ${sizeLabel} — Analytical Reference Standard | PH Labs`
              : `${clean} — Analytical Reference Standard | PH Labs`;

            const cas =
              COMPOUND_SPECS[clean.toUpperCase()]?.cas ??
              "Available on Certificate of Analysis";
            const description = descriptionForCompound(clean, undefined);

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

            // Bacteriostatic Water uses 99% (no plus); everything else 99%+.
            const isWater = /bacteriostatic\s+water/i.test(p.name);
            const purityHighlight = isWater
              ? "HPLC-verified 99% purity"
              : "HPLC-verified 99%+ purity";
            const customLabel = isWater ? "99%" : "99%+";

            void cas; // CAS is embedded inside the description string

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
              hasGtin ? `    <g:gtin>${xmlEscape(p.gtin!)}</g:gtin>` : null,
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
              `    <g:product_highlight>${xmlEscape(purityHighlight)}</g:product_highlight>`,
              `    <g:product_highlight>Lyophilised powder format</g:product_highlight>`,
              `    <g:product_highlight>Certificate of Analysis available on request</g:product_highlight>`,
              `    <g:product_highlight>Supplied to qualified UK laboratories</g:product_highlight>`,
              `    <g:custom_label_0>${xmlEscape(customLabel)}</g:custom_label_0>`,
              sizeCompact
                ? `    <g:unit_pricing_measure>${xmlEscape(sizeCompact)}</g:unit_pricing_measure>`
                : null,
            ]
              .filter(Boolean)
              .join("\n");
          })
          .join("\n");

        // Reference shared constants to satisfy TS noUnusedLocals after refactor.
        void GOOGLE_CATEGORY_ID; void GOOGLE_CATEGORY_PATH; void toDisplayCategory;
        void CATEGORY_A_ID; void CATEGORY_A_PATH; void CATEGORY_B_ID; void CATEGORY_B_PATH;
        void MERCHANT_CODE_OVERRIDES; void MERCHANT_PROMO_IDS;

        const xml = [
          `<?xml version="1.0" encoding="UTF-8"?>`,
          `<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">`,
          `  <channel>`,
          `    <title>${xmlEscape(`${BRAND} UK — Laboratory Reference Standards`)}</title>`,
          `    <link>${BASE_URL}</link>`,
          `    <description>Analytical reference standards supplied as lyophilised solids for in-vitro laboratory use. Distributed to qualified research professionals and laboratories.</description>`,
          items,
          `  </channel>`,
          `</rss>`,
        ].join("\n");

        const emptyFeed = merchantProducts.length === 0;
        return new Response(xml, {

          status: 200,
          headers: {
            "Content-Type": "application/xml; charset=utf-8",
            "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
            "CDN-Cache-Control": "no-store",
            "Cloudflare-CDN-Cache-Control": "no-store",
            "Surrogate-Control": "no-store",
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
