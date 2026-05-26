import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useState } from "react";
import { fetchAllProducts, type SeoProduct } from "@/lib/firestore-rest";
import { SITE_URL } from "@/lib/seo-meta";
import { LoadingFallback } from "@/components/LoadingFallback";

const LegacyApp = lazy(() => import("@/legacy/LegacyApp"));

const TITLE = "Research Peptides UK | Full Catalogue | Pro Health Peptides";
const DESCRIPTION =
  "Browse HPLC-verified research peptides from Pro Health Peptides. Lab-tested purity, transparent COAs, fast UK dispatch.";
const URL = `${SITE_URL}/products`;
const OG_IMAGE = `${SITE_URL}/og-image.jpg`;

export const Route = createFileRoute("/products")({
  loader: async () => {
    try {
      const products = await fetchAllProducts();
      return { products };
    } catch {
      return { products: [] as SeoProduct[] };
    }
  },
  head: ({ loaderData }) => {
    const itemList = {
      "@context": "https://schema.org",
      "@type": "ItemList",
      name: "Research Peptides Catalogue",
      numberOfItems: loaderData?.products.length ?? 0,
      itemListElement: (loaderData?.products ?? []).slice(0, 30).map((p, i) => ({
        "@type": "ListItem",
        position: i + 1,
        url: `${SITE_URL}/products/${p.slug}`,
        name: p.name,
        image: p.imageUrl || undefined,
      })),
    };
    return {
      meta: [
        { key: "title", title: TITLE },
        { key: "description", name: "description", content: DESCRIPTION },
        // Tell prerender.io to wait for window.prerenderReady = true
        // before capturing the DOM (set by Products page after Firestore load).
        { key: "prerender-ready", name: "prerender-ready", content: "false" },
        { key: "fragment", name: "fragment", content: "!" },
        { key: "og:title", property: "og:title", content: TITLE },
        { key: "og:description", property: "og:description", content: DESCRIPTION },
        { key: "og:type", property: "og:type", content: "website" },
        { key: "og:url", property: "og:url", content: URL },
        { key: "og:image", property: "og:image", content: OG_IMAGE },
        { key: "twitter:title", name: "twitter:title", content: TITLE },
        { key: "twitter:description", name: "twitter:description", content: DESCRIPTION },
        { key: "twitter:image", name: "twitter:image", content: OG_IMAGE },
      ],
      links: [{ rel: "canonical", href: URL }],
      scripts: [
        {
          type: "application/ld+json",
          children: JSON.stringify(itemList),
        },
      ],
    };
  },
  component: ProductsRoute,
  errorComponent: () => <LegacyMount />,
});

function ProductsRoute() {
  const { products } = Route.useLoaderData();
  return (
    <>
      <SeoCatalogue products={products} />
      <LegacyMount />
    </>
  );
}

/**
 * Crawler-visible product list rendered in the initial HTML so prerender.io
 * (and any direct fetch) sees real content. Hidden from human users — the
 * interactive React app replaces the visible UI once mounted.
 */
function SeoCatalogue({ products }: { products: SeoProduct[] }) {
  return (
    <div aria-hidden="true" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>
      <h1>Research Peptides UK — Full Catalogue</h1>
      <p>
        HPLC-tested, research-grade lyophilised peptides from Pro Health
        Peptides UK. {products.length} compounds available.
      </p>
      <ul>
        {products.map((p) => (
          <li key={p.id}>
            <a href={`/products/${p.slug}`}>
              <strong>{p.name}</strong>
              {p.price ? ` — £${p.price.toFixed(2)}` : ""}
            </a>
            {p.description ? <p>{p.description.slice(0, 240)}</p> : null}
          </li>
        ))}
      </ul>
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
