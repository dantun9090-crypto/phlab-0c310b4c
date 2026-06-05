/**
 * Auto-recache hook for Prerender.io.
 *
 * Fetches the current sitemap.xml and POSTs every URL to
 * https://api.prerender.io/recache (desktop + mobile) so freshly-published
 * content is reflected in Prerender.io's cache without any manual click.
 *
 * Auth: requires `x-recache-secret` header to equal PRERENDER_TOKEN
 *       (server-only secret, never shipped to the client). This lets pg_cron
 *       and other trusted callers trigger it; random visitors cannot.
 *
 * Idempotent — Prerender.io de-duplicates pending recache jobs internally.
 */
import { createFileRoute } from "@tanstack/react-router";

const SITEMAP_URL = "https://phlabs.co.uk/sitemap.xml";
const RECACHE_URL = "https://api.prerender.io/recache";

// Per-isolate cooldown so an attacker who somehow learns the token still
// can't hammer Prerender.io. 60s is well below cron cadence.
let lastRunAt = 0;
const MIN_INTERVAL_MS = 60_000;

async function recacheBatch(
  token: string,
  urls: string[],
  adaptiveType: "desktop" | "mobile",
): Promise<{ ok: boolean; status: number; response: string }> {
  const res = await fetch(RECACHE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prerenderToken: token, urls, adaptiveType }),
    signal: AbortSignal.timeout(30_000),
  });
  const text = await res.text();
  return { ok: res.ok, status: res.status, response: text.slice(0, 300) };
}

export const Route = createFileRoute("/api/public/hooks/prerender-recache")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = process.env.PRERENDER_TOKEN;
        if (!token) {
          return Response.json(
            { ok: false, error: "PRERENDER_TOKEN not configured" },
            { status: 500 },
          );
        }

        const provided = request.headers.get("x-recache-secret");
        const url = new URL(request.url);
        if (!provided || provided !== token) {
          return new Response("Unauthorized", { status: 401 });
        }


        const force = url.searchParams.get("force") === "1";
        const now = Date.now();
        if (!force && now - lastRunAt < MIN_INTERVAL_MS) {
          return Response.json(
            { ok: true, skipped: true, reason: "cooldown", lastRunAt },
            { status: 200 },
          );
        }
        lastRunAt = now;

        // Fetch sitemap
        let urls: string[] = [];
        try {
          const smRes = await fetch(SITEMAP_URL, {
            headers: { "User-Agent": "phlabs-recache-hook/1.0" },
            signal: AbortSignal.timeout(15_000),
          });
          if (!smRes.ok) {
            return Response.json(
              { ok: false, error: `sitemap HTTP ${smRes.status}` },
              { status: 502 },
            );
          }
          const xml = await smRes.text();
          urls = Array.from(xml.matchAll(/<loc>([^<]+)<\/loc>/g))
            .map((m) => m[1].trim())
            .filter((u) => u.startsWith("https://phlabs.co.uk"));
        } catch (err) {
          return Response.json(
            {
              ok: false,
              error: `sitemap fetch failed: ${err instanceof Error ? err.message : String(err)}`,
            },
            { status: 502 },
          );
        }

        if (urls.length === 0) {
          return Response.json(
            { ok: false, error: "No URLs found in sitemap" },
            { status: 500 },
          );
        }

        const desktop = await recacheBatch(token, urls, "desktop");
        const mobile = await recacheBatch(token, urls, "mobile");

        return Response.json({
          ok: desktop.ok && mobile.ok,
          count: urls.length,
          desktop,
          mobile,
          ranAt: new Date(now).toISOString(),
        });
      },
    },
  },
});
