import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { fetchAllProducts, type SeoProduct } from "@/lib/firestore-rest";
import { SITE_URL } from "@/lib/seo-meta";

const LegacyApp = lazy(() => import("@/legacy/LegacyApp"));

const TITLE = "Research Peptides UK | Full Catalogue | PH Labs";
const DESCRIPTION =
  "Browse HPLC-verified research peptides from PH Labs. Lab-tested purity, transparent COAs, fast UK dispatch.";
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
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return <LoadingFallback />;
  return (
    <Suspense fallback={<LoadingFallback />}>
      <LegacyApp />
    </Suspense>
  );
}
