import { createFileRoute } from "@tanstack/react-router";
import { LegacyMount } from "@/lib/legacy-mount";
import { SITE_URL } from "@/lib/seo-meta";

// Dedicated SEO metadata for the compliant Semrush-targeted pillar article
// (targets "what are peptides" KDI 45 + "uk peptides" KDI 52). The splat
// fallback would emit generic "Resource | PH Labs UK" meta — this route
// owns the precise title, description, canonical, OG and Twitter tags.
const PATH = "/resources/peptide-categories-uk-research";
const URL = `${SITE_URL}${PATH}`;
const TITLE = "Peptide Categories in UK Research — 7 Classes | PH Labs UK";
const DESCRIPTION =
  "The seven peptide classes characterised in UK laboratories: collagen fragments, BPC-157/TB-500, GH secretagogues, incretin analogues, melanocortin ligands, MOTS-c and immunomodulatory peptides. For Research Use Only.";
const OG_IMAGE = `${SITE_URL}/og-image.jpg`;

export const Route = createFileRoute(
  "/resources/peptide-categories-uk-research",
)({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      {
        name: "keywords",
        content:
          "what are peptides, uk peptides, peptides uk, peptide categories, research peptides, peptide classes, laboratory peptides",
      },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "article" },
      { property: "og:url", content: URL },
      { property: "og:image", content: OG_IMAGE },
      { property: "og:site_name", content: "PH Labs UK" },
      { property: "og:locale", content: "en_GB" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: TITLE },
      { name: "twitter:description", content: DESCRIPTION },
      { name: "twitter:image", content: OG_IMAGE },
      { name: "twitter:url", content: URL },
    ],
    links: [{ rel: "canonical", href: URL }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Article",
          headline:
            "Peptide Categories in UK Laboratory Research: 7 Classes Studied in Modern Labs",
          description: DESCRIPTION,
          mainEntityOfPage: URL,
          url: URL,
          image: OG_IMAGE,
          inLanguage: "en-GB",
          datePublished: "2026-06-28",
          author: { "@type": "Organization", name: "PH Labs UK" },
          publisher: {
            "@type": "Organization",
            name: "PH Labs UK",
            logo: { "@type": "ImageObject", url: `${SITE_URL}/og-image.jpg` },
          },
        }),
      },
    ],
  }),
  component: () => <LegacyMount path={PATH} />,
});
