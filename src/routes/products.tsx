import { createFileRoute } from "@tanstack/react-router";
import LegacyApp from "@/legacy/LegacyApp";
import { fetchAllProductsFn, type SeoProduct } from "@/lib/products-rest.functions";
import { SITE_URL } from "@/lib/seo-meta";

const TITLE = "Research Peptides UK | Full Catalogue | PH Labs";
const DESCRIPTION =
  "Browse HPLC-verified research peptides from PH Labs. Lab-tested purity, transparent COAs, fast UK dispatch.";
const URL = `${SITE_URL}/products`;
const OG_IMAGE = `${SITE_URL}/og-image.jpg`;

export const Route = createFileRoute("/products")({
  loader: async () => {
    // Server fn — runs on the Worker on both SSR and client navigation,
    // so no browser-side fetch to firestore.googleapis.com (avoids CORS
    // preflight failure on the custom cache-bust header).
    try {
      const products = await fetchAllProductsFn();
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
        { title: TITLE },
        { name: "description", content: DESCRIPTION },
        { property: "og:title", content: TITLE },
        { property: "og:description", content: DESCRIPTION },
        { property: "og:type", content: "website" },
        { property: "og:url", content: URL },
        { property: "og:image", content: OG_IMAGE },
        { name: "twitter:title", content: TITLE },
        { name: "twitter:description", content: DESCRIPTION },
        { name: "twitter:image", content: OG_IMAGE },
        { name: "twitter:url", content: URL },
      ],
      // Safe to set canonical here: /products/$slug now uses the escaped
      // filename products_.$slug.tsx, so it's a sibling — not a child — and
      // TanStack does not concat this <link> into the product detail page.
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
        HPLC-tested, research-grade lyophilised peptides from PH Labs
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
  return <LegacyApp initialPath="/products" />;
}
