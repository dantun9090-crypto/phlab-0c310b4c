import { createFileRoute, notFound, redirect } from "@tanstack/react-router";
import LegacyApp from "@/legacy/LegacyApp";
import {
  fetchProductBySlugFn,
  fetchProductByIdFn,
  type SeoProduct,
} from "@/lib/products-rest.functions";
import { SEO_LIMITS, SITE_URL, clamp } from "@/lib/seo-meta";
import { RESEARCH_CONTENT } from "@/lib/research-content";
import { resolveSlugFromId } from "@/lib/product-id-slug-map";
import { DUAL_ENTRY_ALIASES } from "@/lib/merchant-dual-entries";
import { PRODUCT_SEO_OVERRIDES } from "@/lib/product-seo-overrides";

const OG_IMAGE_FALLBACK = `${SITE_URL}/og-image.jpg`;

// A "slug-shaped" param is lowercase alnum+hyphens; anything else (uppercase,
// underscores) is treated as a Firestore document ID.
const SLUG_RE = /^[a-z0-9-]+$/;

// Legacy/external slug aliases → 301 to the canonical product slug.
// Keeps old inbound links (and Google index entries) from 404'ing.
// Includes Google Merchant dual-entry URLs (Entry A numeric+slug,
// Entry B no-hyphen slug) — both forms 301 to canonical product page.
const LEGACY_SLUG_ALIASES: Record<string, string> = {
  "bpc-157-research-peptide": "bpc-157",
  "tb-500-research-peptide": "tb-500-thymosin-beta-4",
  // Short Google Merchant / inbound slugs → canonical long slug.
  retatrutide: "retatrutide-research-peptide",
  tirzepatide: "tirzepatide-research-peptide",
  "nad-plus": "nad-research-compound",
  // NOTE: DUAL_ENTRY_ALIASES intentionally NOT spread here. Google Merchant
  // Center disapproves listings whose link 301-redirects to another URL — the
  // landing page must return 200 directly. Dual-entry slugs are therefore
  // resolved in-place below (branch 0) without redirecting.
};


export const Route = createFileRoute("/products_/$slug")({
  loader: async ({ params }) => {
    const raw = params.slug;

    // 0) Dual-entry GMC alias — render the canonical product IN PLACE so
    //    the URL keeps the opaque dual-entry slug (no 301). Merchant Center
    //    fetches the link directly and requires HTTP 200. The canonical
    //    <link> in head() still points to the real product slug for SEO.
    const dualTarget = DUAL_ENTRY_ALIASES[raw.toLowerCase()];
    if (dualTarget) {
      const product = await fetchProductBySlugFn({ data: { slug: dualTarget } });
      if (product) return { product, matchedBy: "id" as const };
      throw notFound();
    }

    const looksLikeSlug = SLUG_RE.test(raw);

    // 1) Slug-shaped → existing behavior: slug lookup + canonical redirect.
    if (looksLikeSlug) {
      const aliasTarget = LEGACY_SLUG_ALIASES[raw];
      if (aliasTarget) {
        throw redirect({
          to: "/products/$slug",
          params: { slug: aliasTarget },
          statusCode: 301,
        });
      }
      const product = await fetchProductBySlugFn({ data: { slug: raw } });
      if (product) {
        if (product.slug !== raw) {
          throw redirect({
            to: "/products/$slug",
            params: { slug: product.slug },
            statusCode: 301,
          });
        }
        return { product, matchedBy: "slug" as const };
      }
      throw notFound();
    }

    // 2) Otherwise treat as a Firestore document ID. Render the SAME product
    //    page in place — do NOT redirect — so the address bar keeps the ID
    //    URL (used by Google Merchant feed). The canonical <link> below
    //    still points to the slug version, so SEO consolidates correctly.
    const mappedSlug = resolveSlugFromId(raw);
    if (mappedSlug) {
      const product = await fetchProductBySlugFn({ data: { slug: mappedSlug } });
      if (product) return { product, matchedBy: "id" as const };
    }

    // 3) Fallback: live Firestore lookup for IDs not yet in the static map.
    try {
      const product = await fetchProductByIdFn({ data: { id: raw } });
      if (product) return { product, matchedBy: "id" as const };
    } catch {
      // swallow lookup errors and fall through to notFound
    }
    throw notFound();
  },
  head: ({ params, loaderData }) => {
    const product = loaderData?.product;
    const name = product?.name ?? params.slug;
    // Resolution order:
    //   1. PRODUCT_SEO_OVERRIDES — hand-tuned, keyword-led, ≤60/≤160 chars
    //      for high-value UK target queries (Semrush-derived).
    //   2. Firestore-managed seoTitle / seoDescription.
    //   3. Generated fallback so older docs without SEO fields still ship
    //      compliant tags.
    const override = product?.slug ? PRODUCT_SEO_OVERRIDES[product.slug] : undefined;
    const rawTitle =
      override?.title ||
      product?.seoTitle?.trim() ||
      `${name} — Research Grade | PH Labs`;
    const title = clamp(rawTitle, SEO_LIMITS.titleMax);
    const baseDesc =
      override?.description ||
      product?.seoDescription?.trim() ||
      product?.description ||
      `${name}: HPLC-verified research peptide from PH Labs UK.`;
    const description = clamp(baseDesc.replace(/\s+/g, " ").trim(), SEO_LIMITS.descriptionMax);
    // Canonical always points to the slug URL, even when the page was
    // opened via the Firestore-ID alias (/products/{id}).
    const url = `${SITE_URL}/products/${product?.slug ?? params.slug}`;
    const image = product?.imageUrl || OG_IMAGE_FALLBACK;

    // Parse a measurement (e.g. "10 mg", "5mg", "100 mcg", "2 IU", "30 ml")
    // from the product name so Google Merchant has a unit of measure.
    const measureMatch = (name || "").match(
      /(\d+(?:\.\d+)?)\s*(mg|mcg|µg|ug|iu|g|ml)\b/i,
    );
    const unitMap: Record<string, { code: string; label: string }> = {
      mg: { code: "MGM", label: "mg" },
      mcg: { code: "MC", label: "mcg" },
      µg: { code: "MC", label: "mcg" },
      ug: { code: "MC", label: "mcg" },
      g: { code: "GRM", label: "g" },
      iu: { code: "IU", label: "IU" },
      ml: { code: "MLT", label: "ml" },
    };
    const measure = measureMatch
      ? {
          value: Number(measureMatch[1]),
          ...unitMap[measureMatch[2].toLowerCase()],
        }
      : null;

    const jsonLd: Record<string, any> = {
      "@context": "https://schema.org",
      "@type": "Product",
      "@id": `${url}#product`,
      name,
      description: baseDesc.slice(0, 5000),
      image,
      url,
      sku: product?.id,
      mpn: product?.id,
      brand: { "@type": "Brand", name: "PH Labs", url: SITE_URL },
      manufacturer: { "@type": "Organization", name: "PH Labs UK", url: SITE_URL },
      category: product?.category,
      // AggregateRating intentionally omitted — Google penalises self-published
      // ratings without verified third-party source. Stars will be sourced from
      // Google Customer Reviews (renderGoogleCustomerReviewsOptIn on
      // /payment/success) and re-introduced here once we have a verified feed.
    };
    if (measure) {
      // Google Merchant unit-of-measure signals (size + weight + property).
      jsonLd.weight = {
        "@type": "QuantitativeValue",
        value: measure.value,
        unitCode: measure.code,
      };
      jsonLd.size = `${measure.value} ${measure.label}`;
      jsonLd.additionalProperty = [
        {
          "@type": "PropertyValue",
          name: "unit_pricing_measure",
          value: `${measure.value} ${measure.label}`,
        },
      ];
    }
    if (product?.price) {
      const inStock = typeof product?.stock === "number" ? product.stock > 0 : true;
      jsonLd.offers = {
        "@type": "Offer",
        url,
        priceCurrency: "GBP",
        price: product.price.toFixed(2),
        availability: inStock
          ? "https://schema.org/InStock"
          : "https://schema.org/OutOfStock",
        itemCondition: "https://schema.org/NewCondition",
        shippingDetails: {
          "@type": "OfferShippingDetails",
          shippingRate: {
            "@type": "MonetaryAmount",
            value: "4.99",
            currency: "GBP",
          },
          shippingDestination: {
            "@type": "DefinedRegion",
            addressCountry: "GB",
          },
          deliveryTime: {
            "@type": "ShippingDeliveryTime",
            handlingTime: {
              "@type": "QuantitativeValue",
              minValue: 0,
              maxValue: 1,
              unitCode: "DAY",
            },
            transitTime: {
              "@type": "QuantitativeValue",
              minValue: 1,
              maxValue: 2,
              unitCode: "DAY",
            },
          },
        },
        hasMerchantReturnPolicy: {
          "@type": "MerchantReturnPolicy",
          applicableCountry: "GB",
          returnPolicyCategory: "https://schema.org/MerchantReturnFiniteReturnWindow",
          merchantReturnDays: 14,
          returnMethod: "https://schema.org/ReturnByMail",
          returnFees: "https://schema.org/FreeReturn",
        },
        ...(measure
          ? {
              eligibleQuantity: {
                "@type": "QuantitativeValue",
                value: measure.value,
                unitCode: measure.code,
              },
            }
          : {}),
      };
    }

    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "product" },
        { property: "og:url", content: url },
        { property: "og:image", content: image },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:title", content: title },
        { name: "twitter:description", content: description },
        { name: "twitter:image", content: image },
        { name: "twitter:url", content: url },
      ],
      links: [
        { rel: "canonical", href: url },
        // Preload the LCP product hero image so it paints in the first
        // network round-trip — improves LCP ~300-600ms on cold loads.
        ...(image ? [{ rel: "preload" as const, as: "image" as const, href: image, fetchpriority: "high" as const }] : []),
      ],
      scripts: [
        { type: "application/ld+json", children: JSON.stringify(jsonLd) },
        {
          type: "application/ld+json",
          children: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            itemListElement: [
              { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
              { "@type": "ListItem", position: 2, name: "Products", item: `${SITE_URL}/products` },
              { "@type": "ListItem", position: 3, name, item: url },
            ],
          }),
        },
        // FAQPage JSON-LD — only when the visible ResearchContentBlock will
        // render Q&As for this slug, so structured data mirrors on-page content.
        ...(RESEARCH_CONTENT[params.slug]?.faqs?.length
          ? [{
              type: "application/ld+json" as const,
              children: JSON.stringify({
                "@context": "https://schema.org",
                "@type": "FAQPage",
                "@id": `${url}#faq`,
                mainEntity: RESEARCH_CONTENT[params.slug]!.faqs.map((f) => ({
                  "@type": "Question",
                  name: f.q,
                  acceptedAnswer: { "@type": "Answer", text: f.a },
                })),
              }),
            }]
          : []),
      ],
    };
  },
  component: ProductDetailRoute,
  notFoundComponent: NotFoundLegacy,
  errorComponent: () => <LegacyMount />,

});

function ProductDetailRoute() {
  const { product } = Route.useLoaderData();
  return (
    <>
      <SeoProductBlock product={product} />
      {/* When opened via /products/{id}, the legacy app needs the SLUG
          to look up and render the product — pass the resolved slug. */}
      <LegacyApp initialPath={`/products/${product.slug}`} />
    </>
  );
}

function SeoProductBlock({ product }: { product: SeoProduct }) {
  const url = `${SITE_URL}/products/${product.slug}`;
  // NOTE: no <h1> here — the visible product page (LegacyApp) emits the
  // canonical product H1. A second hidden H1 here would create a duplicate-H1
  // SEO violation that flags on Lighthouse / Ahrefs / Screaming Frog audits.
  return (
    <div aria-hidden="true" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>
      <p>{product.name}</p>
      {product.imageUrl ? <img src={product.imageUrl} alt={`${product.name} research peptide vial — PH Labs UK`} /> : null}
      {product.price ? <p>Price: £{product.price.toFixed(2)} GBP</p> : null}
      {product.purity ? <p>Purity: {product.purity}</p> : null}
      <p>{product.description}</p>
      <p>
        Category: {product.category}. Supplied by PH Labs UK.{" "}
        <a href={url}>{url}</a>
      </p>
    </div>
  );
}

function LegacyMount() {
  const { slug } = Route.useParams();
  return <LegacyApp initialPath={`/products/${slug}`} />;
}

function NotFoundLegacy() {
  // React 19 hoists these meta tags into <head> during SSR so prerender.io
  // sees a 404 signal for missing product slugs (loader throws notFound()
  // before head() can run).
  return (
    <>
      <meta name="prerender-status-code" content="404" />
      <meta name="robots" content="noindex, follow" />
      <LegacyMount />
    </>
  );
}

