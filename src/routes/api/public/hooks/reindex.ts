/**
 * Fast-reindex hook — IndexNow + Prerender.io recache + GSC Inspector deep-links.
 *
 * Default URL list: /compound and /peptide-calculator (the two newly-launched
 * landing pages we want crawled ASAP after publish). Callers may POST a
 * custom `{ urls: string[] }` body to reindex a different set.
 *
 * Pipelines triggered:
 *   1. IndexNow → Bing / Yandex / Seznam / Naver (instant push, real API).
 *   2. Prerender.io /recache → refreshes the SSR snapshot served to crawlers.
 *   3. Google Search Console URL Inspector deep-links → returned to the
 *      caller. Google offers no public "Request Indexing" automation
 *      endpoint, so the operator (or a downstream tool) clicks the link to
 *      submit the URL from the GSC UI. This is the only sanctioned path.
 *
 * Auth: requires `x-recache-secret` header equal to PRERENDER_TOKEN (same
 *       secret already used by /api/public/hooks/prerender-recache).
 */
import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqualStr } from "@/lib/timing-safe-equal";
import { enforceRateLimit } from "@/lib/rate-limit";

const HOST = "phlabs.co.uk";
const DEFAULT_PATHS = ["/compound", "/peptide-calculator"];
const INDEXNOW_ENDPOINT = "https://api.indexnow.org/IndexNow";
const PRERENDER_ENDPOINT = "https://api.prerender.io/recache";

// Per-isolate cooldown so a leaked token can't be used to hammer downstreams.
let lastRunAt = 0;
const MIN_INTERVAL_MS = 30_000;

function gscInspectorUrl(target: string): string {
  // Deep-link into the GSC URL Inspector for the verified `sc-domain:phlabs.co.uk` property.
  const property = encodeURIComponent("sc-domain:phlabs.co.uk");
  return `https://search.google.com/search-console/inspect?resource_id=${property}&id=${encodeURIComponent(target)}`;
}

async function postIndexNow(
  key: string,
  urls: string[],
): Promise<{ ok: boolean; status: number; submitted: number; response: string }> {
  const body = {
    host: HOST,
    key,
    keyLocation: `https://${HOST}/${key}.txt`,
    urlList: urls,
  };
  try {
    const res = await fetch(INDEXNOW_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
    });
    const text = await res.text().catch(() => "");
    return { ok: res.ok, status: res.status, submitted: urls.length, response: text.slice(0, 300) };
  } catch (e) {
    return { ok: false, status: 0, submitted: 0, response: `network: ${e instanceof Error ? e.message : String(e)}` };
  }
}

async function postPrerenderRecache(
  token: string,
  urls: string[],
  adaptiveType: "desktop" | "mobile",
): Promise<{ ok: boolean; status: number; response: string }> {
  try {
    const res = await fetch(PRERENDER_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prerenderToken: token, urls, adaptiveType }),
      signal: AbortSignal.timeout(20_000),
    });
    const text = await res.text().catch(() => "");
    return { ok: res.ok, status: res.status, response: text.slice(0, 300) };
  } catch (e) {
    return { ok: false, status: 0, response: `network: ${e instanceof Error ? e.message : String(e)}` };
  }
}

export const Route = createFileRoute("/api/public/hooks/reindex")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const ENDPOINT = "/api/public/hooks/reindex";

        // Per-IP throttle on top of cooldown.
        const limited = await enforceRateLimit(request, ENDPOINT, {
          limit: 12,
          windowMs: 60_000,
          retryAfterSec: 60,
        });
        if (limited) return limited;

        const sharedSecret = process.env.PRERENDER_TOKEN;
        const indexNowKey = process.env.BING_INDEXNOW_API_KEY;

        if (!sharedSecret) {
          return Response.json(
            { ok: false, error: "PRERENDER_TOKEN not configured" },
            { status: 500 },
          );
        }

        const provided = request.headers.get("x-recache-secret") ?? "";
        if (!timingSafeEqualStr(provided, sharedSecret)) {
          return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
        }

        const now = Date.now();
        if (now - lastRunAt < MIN_INTERVAL_MS) {
          const retryIn = Math.ceil((MIN_INTERVAL_MS - (now - lastRunAt)) / 1000);
          return Response.json(
            { ok: false, error: "cooldown", retryAfterSec: retryIn },
            { status: 429, headers: { "retry-after": String(retryIn) } },
          );
        }
        lastRunAt = now;

        // Resolve URL list.
        let paths: string[] = DEFAULT_PATHS;
        try {
          const body = (await request.json().catch(() => null)) as
            | { urls?: string[] }
            | null;
          if (body?.urls && Array.isArray(body.urls) && body.urls.length > 0) {
            paths = body.urls
              .filter((u): u is string => typeof u === "string")
              .map((u) => (u.startsWith("http") ? new URL(u).pathname + new URL(u).search : u))
              .slice(0, 200);
          }
        } catch {
          // body parse failed → keep defaults
        }

        const fullUrls = Array.from(
          new Set(paths.map((p) => `https://${HOST}${p.startsWith("/") ? p : `/${p}`}`)),
        );

        // 1) IndexNow (Bing / Yandex / Seznam / Naver).
        const indexNowResult = indexNowKey
          ? await postIndexNow(indexNowKey, fullUrls)
          : { ok: false, status: 503, submitted: 0, response: "BING_INDEXNOW_API_KEY missing" };

        // 2) Prerender.io recache (desktop + mobile) for the same URL list.
        const [prDesktop, prMobile] = await Promise.all([
          postPrerenderRecache(sharedSecret, fullUrls, "desktop"),
          postPrerenderRecache(sharedSecret, fullUrls, "mobile"),
        ]);

        // 3) GSC URL Inspector deep-links — manual completion step.
        //    Google has no public Request-Indexing automation endpoint outside
        //    the Indexing API (which is restricted to job-postings / livestreams).
        const gscInspectorLinks = fullUrls.map((u) => ({
          url: u,
          inspector: gscInspectorUrl(u),
        }));

        return Response.json({
          ok: indexNowResult.ok && prDesktop.ok && prMobile.ok,
          submittedUrls: fullUrls,
          indexNow: indexNowResult,
          prerender: { desktop: prDesktop, mobile: prMobile },
          gscInspectorLinks,
          note:
            "Google Search Console Request-Indexing has no public automation endpoint; click each gscInspectorLinks[].inspector URL to submit from the GSC UI.",
        });
      },
    },
  },
});
