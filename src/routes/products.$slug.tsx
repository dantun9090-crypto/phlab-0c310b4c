import { createFileRoute, notFound } from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useState } from "react";
import { fetchProductBySlug, type SeoProduct } from "@/lib/firestore-rest";
import { SEO_LIMITS, SITE_URL, clamp } from "@/lib/seo-meta";

const LegacyApp = lazy(() => import("@/legacy/LegacyApp"));

const OG_IMAGE_FALLBACK = `${SITE_URL}/og-image.jpg`;

export const Route = createFileRoute("/products/$slug")({
  loader: async ({ params }) => {
    const product = await fetchProductBySlug(params.slug);
    if (!product) throw notFound();
    return { product };
  },
  head: ({ params, loaderData }) => {
    const product = loaderData?.product;
    const name = product?.name ?? params.slug;
    const title = clamp(
      `${name} — Research Grade | Pro Health Peptides`,
      SEO_LIMITS.titleMax,
    );
    const baseDesc =
      product?.description ??
      `${name}: HPLC-verified research peptide from Pro Health Peptides UK.`;
    const description = clamp(baseDesc.replace(/\s+/g, " ").trim(), SEO_LIMITS.descriptionMax);
    const url = `${SITE_URL}/products/${params.slug}`;
    const image = product?.imageUrl || OG_IMAGE_FALLBACK;

    const jsonLd: Record<string, any> = {
      "@context": "https://schema.org",
      "@type": "Product",
      name,
      description: baseDesc.slice(0, 5000),
      image,
      url,
      brand: { "@type": "Brand", name: "Pro Health Peptides" },
      category: product?.category,
    };
    if (product?.price) {
      jsonLd.offers = {
        "@type": "Offer",
        url,
        priceCurrency: "GBP",
        price: product.price.toFixed(2),
        availability: "https://schema.org/InStock",
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
      ],
      links: [{ rel: "canonical", href: url }],
      scripts: [
        { type: "application/ld+json", children: JSON.stringify(jsonLd) },
      ],
    };
  },
  component: ProductDetailRoute,
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
        Category: {product.category}. Supplied by Pro Health Peptides UK.{" "}
        <a href={url}>{url}</a>
      </p>
    </div>
  );
}

function LegacyMount() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return (
    <Suspense fallback={null}>
      <LegacyApp />
    </Suspense>
  );
}
