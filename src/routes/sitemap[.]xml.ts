import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
// DOMAIN GUARD: jedynym źródłem kanonicznej domeny jest src/lib/seo-meta.ts
// (SITE_URL + assertCanonicalUrl). Nie hardkoduj "https://phlabs.co.uk" tutaj —
// zmiana w jednym miejscu musi pociągać sitemap, robots, JSON-LD i canonical.
// CI: scripts/check-url-consistency.ts + scripts/check-domains.ts.
import { SITE_URL, assertCanonicalUrl } from "@/lib/seo-meta";
import { buildSitemapEntries } from "@/lib/sitemap-entries";

const BASE_URL = SITE_URL;

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async () => {
        const entries = await buildSitemapEntries();

        const escapeXml = (s: string) =>
          s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

        const urls = entries.map((e) => {
          const loc = `${BASE_URL}${e.path}`;
          assertCanonicalUrl(loc, `sitemap loc for ${e.path}`);
          return [
            `  <url>`,
            `    <loc>${loc}</loc>`,
            e.lastmod ? `    <lastmod>${e.lastmod}</lastmod>` : null,
            e.changefreq ? `    <changefreq>${e.changefreq}</changefreq>` : null,
            e.priority ? `    <priority>${e.priority}</priority>` : null,
            `    <xhtml:link rel="alternate" hreflang="en-GB" href="${loc}" />`,
            `    <xhtml:link rel="alternate" hreflang="x-default" href="${loc}" />`,
            e.imageLoc
              ? `    <image:image>\n      <image:loc>${escapeXml(e.imageLoc)}</image:loc>\n    </image:image>`
              : null,
            `  </url>`,
          ].filter(Boolean).join("\n");
        });

        const xml = [
          `<?xml version="1.0" encoding="UTF-8"?>`,
          `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">`,
          ...urls,
          `</urlset>`,
        ].join("\n");

        return new Response(xml, {
          headers: {
            "Content-Type": "application/xml",
            "Cache-Control": "public, max-age=3600, s-maxage=3600",
            "Surrogate-Control": "max-age=3600",
          },
        });
      },
    },
  },
});
