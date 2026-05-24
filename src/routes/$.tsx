import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, lazy, Suspense } from "react";
import { SEO_LIMITS, SITE_URL, canonicalUrl, clamp, metaForPath } from "@/lib/seo-meta";

const LegacyApp = lazy(() => import("@/legacy/LegacyApp"));

const OG_IMAGE = `${SITE_URL}/og-image.jpg`;


export const Route = createFileRoute("/$")({
  ssr: false,
  head: ({ params }) => {
    const splat = (params as { _splat?: string })._splat ?? "";
    const pageMeta = metaForPath(splat);
    const title = clamp(pageMeta.title, SEO_LIMITS.titleMax);
    const description = clamp(pageMeta.description, SEO_LIMITS.descriptionMax);

    const url = canonicalUrl(splat);


    return {
      meta: [
        { key: "title", title },
        { key: "description", name: "description", content: description },
        { key: "og:title", property: "og:title", content: title },
        { key: "og:description", property: "og:description", content: description },
        { key: "og:type", property: "og:type", content: pageMeta.ogType },
        { key: "og:url", property: "og:url", content: url },
        { key: "og:image", property: "og:image", content: OG_IMAGE },
        { key: "twitter:title", name: "twitter:title", content: title },
        { key: "twitter:description", name: "twitter:description", content: description },
        { key: "twitter:image", name: "twitter:image", content: OG_IMAGE },
      ],
      links: [{ rel: "canonical", href: url }],
    };
  },

  component: LegacyMount,
});

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
