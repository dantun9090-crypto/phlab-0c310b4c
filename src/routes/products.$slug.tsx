import { createFileRoute, notFound, redirect } from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useState } from "react";
import { fetchProductBySlug, type SeoProduct } from "@/lib/firestore-rest";
import { SEO_LIMITS, SITE_URL, clamp } from "@/lib/seo-meta";

const LegacyApp = lazy(() => import("@/legacy/LegacyApp"));

const OG_IMAGE_FALLBACK = `${SITE_URL}/og-image.jpg`;

export const Route = createFileRoute("/products/$slug")({
  loader: async ({ params }) => {
    const product = await fetchProductBySlug(params.slug);
    if (!product) throw notFound();
    // If we resolved via prefix/legacy match, 301 to the canonical slug
    // so Google Merchant Center short URLs (e.g. /products/klow-blend)
    // redirect to the real product page instead of returning 404.
    if (product.slug !== params.slug) {
      throw redirect({
        to: "/products/$slug",
        params: { slug: product.slug },
        statusCode: 301,
      });
    }
    return { product };
  },
  head: ({ params, loaderData }) => {
    const product = loaderData?.product;
    const name = product?.name ?? params.slug;
    // Prefer Firestore-managed seoTitle / seoDescription. Fall back to
    // a generated title/description so older docs without SEO fields
    // still render compliant tags.
    const rawTitle =
      product?.seoTitle?.trim() ||
      `${name} — Research Grade | PH Labs`;
    const title = clamp(rawTitle, SEO_LIMITS.titleMax);
    const baseDesc =
      product?.seoDescription?.trim() ||
      product?.description ||
      `${name}: HPLC-verified research peptide from PH Labs UK.`;
    const description = clamp(baseDesc.replace(/\s+/g, " ").trim(), SEO_LIMITS.descriptionMax);
    const url = `${SITE_URL}/products/${params.slug}`;
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
      name,
      description: baseDesc.slice(0, 5000),
      image,
      url,
      sku: product?.id,
      mpn: product?.id,
      brand: { "@type": "Brand", name: "PH Labs", url: SITE_URL },
      manufacturer: { "@type": "Organization", name: "PH Labs UK", url: SITE_URL },
      category: product?.category,
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
        // Tell prerender.io to wait for window.prerenderReady = true
        // before capturing the DOM (set by ProductDetail page after Firestore load).
        { name: "prerender-ready", content: "false" },
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
      links: [{ rel: "canonical", href: url }],
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
      ],
    };
  },
  component: ProductDetailRoute,
  notFoundComponent: () => <LegacyMount />,
  errorComponent: () => <LegacyMount />,
});

function ProductDetailRoute() {
  const { product } = Route.useLoaderData();
  return (
    <>
      <SeoProductBlock product={product} />
      <LegacyMount />
    </>
  );
}

function SeoProductBlock({ product }: { product: SeoProduct }) {
  const url = `${SITE_URL}/products/${product.slug}`;
  return (
    <div aria-hidden="true" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>
      <h1>{product.name}</h1>
      {product.imageUrl ? <img src={product.imageUrl} alt={product.name} /> : null}
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

function LoadingFallback() {
  return (
    <div className="min-h-screen bg-[#060f1e] pt-24 flex items-center justify-center" aria-hidden="true">
      <div className="relative">
        <div className="w-12 h-12 rounded-full border-2 border-blue-600/20 border-t-blue-500 animate-spin" />
        <div
          className="absolute inset-0 w-12 h-12 rounded-full border-2 border-transparent border-b-blue-400/40 animate-spin"
          style={{ animationDirection: 'reverse', animationDuration: '1.5s' }}
        />
      </div>
    </div>
  );
}

function LegacyMount() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return <LoadingFallback />;
  return (
    <Suspense fallback={<LoadingFallback />}>
      <LegacyApp />
    </Suspense>
  );
}
