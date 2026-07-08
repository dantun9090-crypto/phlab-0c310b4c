/**
 * /robots.txt — served dynamically so the src/server.ts
 * `applyDynamicAssetCacheHeaders` policy actually applies:
 *   - browser: public, max-age=300, must-revalidate
 *   - CDN:     no-store  (cdn-cache-control + cloudflare-cdn-cache-control)
 *
 * The previous copy at `public/robots.txt` was served by Cloudflare's
 * static-asset handler with `cache-control: public, max-age=31536000,
 * immutable` — bypassing the dynamic-asset wrapper entirely. A stale
 * robots.txt would stop Google from picking up new sitemap entries and
 * indexing new inventory, so the file now lives at src/assets/robots.txt
 * (imported as a raw string at build time) and is served through this
 * server route.
 *
 * To edit the crawler rules, change src/assets/robots.txt — the content
 * is bundled at build time so there is no runtime filesystem read.
 *
 * The `[.]` in the filename escapes the literal dot so the route resolves
 * to `/robots.txt` (see the sitemap[.]xml.ts sibling for the same trick).
 */
import { createFileRoute } from "@tanstack/react-router";
import robotsTxt from "@/assets/robots.txt?raw";

export const Route = createFileRoute("/robots.txt")({
  server: {
    handlers: {
      GET: async () => {
        // Trim trailing whitespace so byte-length stays deterministic and
        // ensure a single trailing newline (some crawlers are picky).
        const body = robotsTxt.replace(/\s+$/g, "") + "\n";
        return new Response(body, {
          status: 200,
          headers: {
            "content-type": "text/plain; charset=utf-8",
            // Dynamic-asset policy — src/server.ts will normalise these
            // (cache-control 5 min must-revalidate, CDN no-store), but we
            // set the browser tier here explicitly so a direct-from-origin
            // request (bypassing the outer Worker) still gets sane values.
            "cache-control": "public, max-age=300, must-revalidate",
            "cdn-cache-control": "no-store",
            "cloudflare-cdn-cache-control": "no-store",
            "surrogate-control": "no-store",
            "x-content-type-options": "nosniff",
            // robots.txt itself is a directive file, not a page to index.
            "x-robots-tag": "noindex",
          },
        });
      },
    },
  },
});
