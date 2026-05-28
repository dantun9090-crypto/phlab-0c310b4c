import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { articles } from "@/pages/Resources/data/articles";
import { fetchAllProducts } from "@/lib/firestore-rest";

const BASE_URL = "https://www.phlabs.co.uk";

interface SitemapEntry {
  path: string;
  lastmod?: string;
  changefreq?: "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never";
  priority?: string;
}

const staticEntries: SitemapEntry[] = [
  { path: "/", changefreq: "weekly", priority: "1.0" },
  { path: "/products", changefreq: "daily", priority: "0.9" },
  { path: "/research", changefreq: "weekly", priority: "0.8" },
  { path: "/quality-control", changefreq: "monthly", priority: "0.8" },
  { path: "/lab-reports", changefreq: "weekly", priority: "0.8" },
  { path: "/resources", changefreq: "weekly", priority: "0.7" },
  { path: "/storage-guide", changefreq: "monthly", priority: "0.6" },
  { path: "/about", changefreq: "monthly", priority: "0.6" },
  { path: "/contact", changefreq: "monthly", priority: "0.6" },
  { path: "/shipping-policy", changefreq: "yearly", priority: "0.4" },
  { path: "/refund-policy", changefreq: "yearly", priority: "0.4" },
  { path: "/terms-and-conditions", changefreq: "yearly", priority: "0.3" },
  { path: "/privacy-policy", changefreq: "yearly", priority: "0.3" },
  { path: "/cookies", changefreq: "yearly", priority: "0.3" },
];

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async () => {
        // Dynamic article entries served by the /$ splat route
        const articleEntries: SitemapEntry[] = articles.map((a) => ({
          path: `/resources/${a.slug}`,
          changefreq: "monthly",
          priority: "0.6",
        }));

        // Dynamic product entries — one URL per active product, with lastmod from Firestore updatedAt
        let productEntries: SitemapEntry[] = [];
        try {
          const products = await fetchAllProducts();
          productEntries = products.map((p) => ({
            path: `/products/${p.slug}`,
            lastmod: p.updatedAt ? p.updatedAt.slice(0, 10) : undefined,
            changefreq: "weekly",
            priority: "0.8",
          }));
        } catch {
          productEntries = [];
        }

        // Dedupe by path to guarantee each URL appears exactly once
        const seen = new Set<string>();
        const entries = [...staticEntries, ...productEntries, ...articleEntries].filter((e) => {
          if (seen.has(e.path)) return false;
          seen.add(e.path);
          return true;
        });

        const urls = entries.map((e) =>
          [
            `  <url>`,
            `    <loc>${BASE_URL}${e.path}</loc>`,
            e.lastmod ? `    <lastmod>${e.lastmod}</lastmod>` : null,
            e.changefreq ? `    <changefreq>${e.changefreq}</changefreq>` : null,
            e.priority ? `    <priority>${e.priority}</priority>` : null,
            `  </url>`,
          ].filter(Boolean).join("\n"),
        );

        const xml = [
          `<?xml version="1.0" encoding="UTF-8"?>`,
          `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
          ...urls,
          `</urlset>`,
        ].join("\n");

        return new Response(xml, {
          headers: {
            "Content-Type": "application/xml",
            "Cache-Control": "public, max-age=3600",
          },
        });
      },
    },
  },
});
