/**
 * GET /api/public/diag.banner-source
 *
 * Diagnostic endpoint that returns the promo-banner data source **as SSR
 * sees it right now**, side-by-side with the URL a browser would hit
 * client-side. Point of this endpoint: when the homepage banner "jumps"
 * between SSR and hydrated render, the operator can:
 *
 *   1. `curl https://phlabs.co.uk/api/public/diag.banner-source` → server view
 *   2. Open DevTools on `/` → Network → filter `settings/promoBanner` → client view
 *   3. Diff `imageUrl`, `active`, `updatedAt` — mismatch = stale edge cache or
 *      client running with different Firestore project / rules.
 *
 * Never returns PII; the promoBanner document contains only marketing
 * assets that already ship in the public SSR HTML. Safe for `/api/public`.
 */
import { createFileRoute } from "@tanstack/react-router";
import { fetchPromoBanner } from "@/lib/firestore-rest";

interface DiagPayload {
  ranAt: string;
  server: {
    source: "firestore-rest";
    ok: boolean;
    latencyMs: number;
    banner: {
      present: boolean;
      imageUrl?: string;
      active?: boolean;
      isActive?: boolean;
      altText?: string;
      heightPx?: number;
      ctaUrl?: string;
      linkUrl?: string;
    };
    error?: string;
  };
  client: {
    /** URL the browser would call (Firestore REST, same document). Handy
     *  to paste into DevTools or `curl` for a direct A/B diff. */
    fetchUrl: string;
    note: string;
  };
  buildId: string | null;
  hint: string;
}

export const Route = createFileRoute("/api/public/diag/banner-source")({
  server: {
    handlers: {
      GET: async () => {
        const projectId =
          process.env.FIREBASE_PROJECT_ID ||
          process.env.VITE_FIREBASE_PROJECT_ID ||
          "";
        const apiKey =
          process.env.FIREBASE_API_KEY ||
          process.env.VITE_FIREBASE_API_KEY ||
          "";
        const clientFetchUrl = projectId
          ? `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/settings/promoBanner${apiKey ? `?key=${apiKey.slice(0, 6)}…` : ""}`
          : "unavailable (FIREBASE_PROJECT_ID not set on server)";

        const t0 = Date.now();
        let banner: Awaited<ReturnType<typeof fetchPromoBanner>> = null;
        let error: string | undefined;
        try {
          banner = await fetchPromoBanner();
        } catch (e) {
          error = e instanceof Error ? e.message : String(e);
        }
        const latencyMs = Date.now() - t0;

        const payload: DiagPayload = {
          ranAt: new Date().toISOString(),
          server: {
            source: "firestore-rest",
            ok: !error,
            latencyMs,
            banner: banner
              ? {
                  present: true,
                  imageUrl: banner.imageUrl,
                  active: banner.active,
                  isActive: banner.isActive,
                  altText: banner.altText,
                  heightPx: banner.heightPx,
                  ctaUrl: banner.ctaUrl,
                  linkUrl: banner.linkUrl,
                }
              : { present: false },
            error,
          },
          client: {
            fetchUrl: clientFetchUrl,
            note: "In browser: open /, DevTools → Network → search 'promoBanner'. Compare imageUrl + active with the server block above. Mismatch = stale CF edge cache or a different Firestore project on the client.",
          },
          buildId: process.env.BUILD_ID || null,
          hint:
            banner?.imageUrl && banner?.active !== false
              ? "Server thinks the banner IS active. If the browser shows a different image, purge Cloudflare cache for /."
              : "Server thinks the banner is NOT active (or missing). If the browser shows one anyway, the client has stale JSON — hard reload / disable SW.",
        };

        return new Response(JSON.stringify(payload, null, 2), {
          status: 200,
          headers: {
            "content-type": "application/json; charset=utf-8",
            "cache-control": "no-store, no-cache, must-revalidate, max-age=0",
            "cdn-cache-control": "no-store",
            "x-diag-endpoint": "banner-source",
          },
        });
      },
    },
  },
});
