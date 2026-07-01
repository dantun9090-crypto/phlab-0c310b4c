import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { SITE_URL, assertCanonicalUrl } from "@/lib/seo-meta";
import { buildSitemapEntries } from "@/lib/sitemap-entries";

const BASE_URL = SITE_URL;

/**
 * /bing-feed.xml — Bing/IndexNow-friendly URL feed. Uses the standard
 * sitemap 0.9 schema (Bing accepts it) and shares the SAME entry builder
 * as /sitemap.xml so the two stay in sync automatically.
 */
export const Route = createFileRoute("/bing-feed.xml")({
  server: {
    handlers: {
      GET: async () => {
        const entries = await buildSitemapEntries();

        const urls = entries.map((e) => {
          const loc = `${BASE_URL}${e.path}`;
          assertCanonicalUrl(loc, `bing-feed loc for ${e.path}`);
          return [
            `  <url>`,
            `    <loc>${loc}</loc>`,
            e.lastmod ? `    <lastmod>${e.lastmod}</lastmod>` : null,
            e.changefreq ? `    <changefreq>${e.changefreq}</changefreq>` : null,
            e.priority ? `    <priority>${e.priority}</priority>` : null,
            `  </url>`,
          ].filter(Boolean).join("\n");
        });

        const xml = [
          `<?xml version="1.0" encoding="UTF-8"?>`,
          `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
          ...urls,
          `</urlset>`,
        ].join("\n");

        return new Response(xml, {
          headers: {
            "Content-Type": "application/xml; charset=utf-8",
            "Cache-Control": "public, max-age=3600, s-maxage=3600",
            "Surrogate-Control": "max-age=3600",
            "X-Robots-Tag": "noindex",
          },
        });
      },
    },
  },
});
