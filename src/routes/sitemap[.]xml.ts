import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
// DOMAIN GUARD: jedynym źródłem kanonicznej domeny jest src/lib/seo-meta.ts
// (SITE_URL + assertCanonicalUrl). Nie hardkoduj "https://phlabs.co.uk" tutaj —
// zmiana w jednym miejscu musi pociągać sitemap, robots, JSON-LD i canonical.
// CI: scripts/check-url-consistency.ts + scripts/check-domains.ts.
import { SITE_URL, assertCanonicalUrl } from "@/lib/seo-meta";
import { buildSitemapEntries, type SitemapEntry } from "@/lib/sitemap-entries";

const BASE_URL = SITE_URL;
const PROBE_TIMEOUT_MS = 5000;
const PROBE_CONCURRENCY = 8;

/**
 * Probe each candidate URL against the live origin and keep only ones
 * responding 200. Uses HEAD (with GET fallback) and short-circuits on
 * redirects, 3xx, 4xx, 5xx, or timeouts. Runs against the same origin
 * that served the sitemap request so preview and production stay in
 * sync. Non-page endpoints (splats, feeds, transactional prefixes) are
 * already filtered upstream by isIndexable() in sitemap-entries.
 */
async function filterReachable(
  entries: SitemapEntry[],
  origin: string,
): Promise<SitemapEntry[]> {
  async function probe(entry: SitemapEntry): Promise<SitemapEntry | null> {
    const url = `${origin}${entry.path}`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), PROBE_TIMEOUT_MS);
    try {
      let res = await fetch(url, {
        method: "HEAD",
        redirect: "manual",
        signal: ctrl.signal,
        headers: { "user-agent": "phlabs-sitemap-probe" },
      });
      // Some routes / prerender rules only answer GET — retry once.
      if (res.status === 405 || res.status === 501) {
        res = await fetch(url, {
          method: "GET",
          redirect: "manual",
          signal: ctrl.signal,
          headers: { "user-agent": "phlabs-sitemap-probe" },
        });
      }
      return res.status === 200 ? entry : null;
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  const out: SitemapEntry[] = [];
  for (let i = 0; i < entries.length; i += PROBE_CONCURRENCY) {
    const batch = entries.slice(i, i + PROBE_CONCURRENCY);
    const results = await Promise.all(batch.map(probe));
    for (const r of results) if (r) out.push(r);
  }
  return out;
}

function requestOrigin(): string | null {
  try {
    const req = getRequest();
    const proto = req.headers.get("x-forwarded-proto") ?? "https";
    const host = req.headers.get("host");
    return host ? `${proto}://${host}` : null;
  } catch {
    return null;
  }
}

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async () => {
        const candidates = await buildSitemapEntries();
        console.log("[sitemap] candidates:", candidates.length, candidates.slice(0, 3).map(c => c.path));
        const origin = requestOrigin();
        console.log("[sitemap] origin:", origin);
        // If we can't resolve the request origin (unlikely at runtime),
        // fall back to unprobed entries rather than shipping an empty
        // sitemap. isIndexable() upstream already excludes splats/feeds.
        const entries = origin
          ? await filterReachable(candidates, origin)
          : candidates;
        console.log("[sitemap] entries after filter:", entries.length);

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

