import { createFileRoute } from "@tanstack/react-router";
import LegacyApp from "@/legacy/LegacyApp";
import { fetchAllProductsFn, type SeoProduct } from "@/lib/products-rest.functions";
import { SITE_URL } from "@/lib/seo-meta";

const TITLE = "Buy Research Peptides UK | Catalogue | PH Labs";
const DESCRIPTION =
  "Research peptides for sale UK — full PH Labs catalogue with HPLC-verified purity, batch COAs and fast UK dispatch. For research use only. Not for human consumption.";

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
  head: ({ loaderData, matches }) => {
    // This route is BOTH the /products page and the layout parent of
    // /products/category/$slug (dot-nesting). TanStack concatenates
    // parent + child head() links without dedupe, so the canonical below
    // must only be emitted when /products is the LEAF match — otherwise
    // /products/category/* ships two canonicals (parent's first) and
    // Google reads it as a canonical conflict. Same reason research.tsx
    // is a head-less layout.
    const isLeaf = matches[matches.length - 1]?.routeId === "/products";
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
      links: [
        // /products/$slug uses the escaped filename products_.$slug.tsx
        // (a sibling, not a child), but products.category.$slug.tsx IS a
        // child — hence the leaf guard above.
        ...(isLeaf ? [{ rel: "canonical", href: URL }] : []),
        // The /products hero is text-only (no hero image), so the LCP
        // candidate is the first product card image. No fixed URL exists to
        // preload here (grid order is decided client-side), so instead warm
        // the image + data origins; ProductCard raises fetchPriority on the
        // first card. Grid itself stays eager for the prerender snapshot.
        { rel: "preconnect", href: "https://firebasestorage.googleapis.com", crossOrigin: "" },
        { rel: "preconnect", href: "https://firestore.googleapis.com", crossOrigin: "" },
        { rel: "dns-prefetch", href: "https://firebasestorage.googleapis.com" },
      ],
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
      {/* h2, not h1 — the visible hero already owns the single h1 on /products */}
      <h2>Research Peptides UK — Full Catalogue</h2>
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
