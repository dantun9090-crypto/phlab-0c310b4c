/**
 * Real-User Monitoring beacon for Core Web Vitals.
 *
 * Accepts a POST from `src/lib/web-vitals.ts` (also `sendBeacon` keepalive)
 * and persists a tiny row to Firestore `web_vitals`. Used by the
 * admin "Web Vitals" tab to compute p75 LCP / INP / CLS per route.
 *
 * Intentionally permissive (CORS-open, no auth) with strict zod validation
 * and per-isolate rate limiting. Payload is minimal — no PII, no UA strings
 * stored beyond a short device label.
 */
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { addDocAdmin } from "@/lib/server/firestore-admin";

const ALLOWED_ORIGINS = new Set<string>([
  "https://phlabs.co.uk",
  "https://www.phlabs.co.uk",
]);

function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return true;
  if (ALLOWED_ORIGINS.has(origin)) return true;
  try {
    const host = new URL(origin).hostname.toLowerCase();
    if (host.endsWith(".lovable.app") || host.endsWith(".lovable.dev")) return true;
    if (host === "localhost") return true;
  } catch {
    return false;
  }
  return false;
}

function corsHeaders(origin: string | null): Record<string, string> {
  const allow = origin && isAllowedOrigin(origin) ? origin : "https://phlabs.co.uk";
  return {
    "access-control-allow-origin": allow,
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "content-type",
    "vary": "origin",
  };
}

// --- per-isolate rate limit (best-effort) ---
const HITS = new Map<string, { count: number; resetAt: number }>();
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 240;
function rateLimited(ip: string): boolean {
  const now = Date.now();
  const cur = HITS.get(ip);
  if (!cur || cur.resetAt < now) {
    HITS.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  cur.count++;
  return cur.count > MAX_PER_WINDOW;
}

const METRIC_NAMES = ["LCP", "CLS", "INP", "FCP", "TTFB"] as const;

const Body = z.object({
  name: z.enum(METRIC_NAMES),
  value: z.number().finite().min(0).max(120_000),
  rating: z.enum(["good", "needs-improvement", "poor"]),
  path: z.string().trim().max(300),
  device: z.enum(["mobile", "tablet", "desktop"]).optional(),
  build: z.string().trim().max(40).optional(),
  /** Coarse connection hint from navigator.connection.effectiveType. */
  conn: z.enum(["4g", "3g", "2g", "slow-2g", "unknown"]).optional(),
});

function json(body: unknown, status = 200, origin: string | null = null): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
      ...corsHeaders(origin),
    },
  });
}

export const Route = createFileRoute("/api/public/web-vitals")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) =>
        new Response(null, { status: 204, headers: corsHeaders(request.headers.get("origin")) }),

      POST: async ({ request }) => {
        const origin = request.headers.get("origin");
        if (!isAllowedOrigin(origin)) {
          return json({ error: "forbidden_origin" }, 403, origin);
        }
        const ip =
          request.headers.get("cf-connecting-ip") ||
          request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
          "unknown";
        if (rateLimited(ip)) {
          return json({ error: "rate_limited" }, 429, origin);
        }

        let raw: unknown;
        try {
          raw = await request.json();
        } catch {
          return json({ error: "invalid_json" }, 400, origin);
        }
        const parsed = Body.safeParse(raw);
        if (!parsed.success) {
          return json({ error: "invalid_payload", issues: parsed.error.flatten() }, 400, origin);
        }
        const v = parsed.data;

        // Normalize path so /products/foo and /products/bar bucket sensibly
        // for percentile aggregation in the admin tab.
        const pathBucket = bucketPath(v.path);

        try {
          await addDocAdmin("web_vitals", {
            name: v.name,
            value: Math.round(v.value),
            rating: v.rating,
            path: v.path.slice(0, 200),
            pathBucket,
            device: v.device ?? "desktop",
            conn: v.conn ?? "unknown",
            build: v.build ?? "",
            createdAt: new Date().toISOString(),
          });
        } catch (err) {
          console.error("[web-vitals] persist failed", err);
          return json({ ok: false }, 500, origin);
        }

        return json({ ok: true }, 200, origin);
      },
    },
  },
});

function bucketPath(p: string): string {
  if (!p.startsWith("/")) p = "/" + p;
  if (p === "/") return "/";
  // Collapse dynamic segments to keep bucket cardinality low.
  const segs = p.split("/").filter(Boolean);
  if (segs[0] === "products" && segs[1]) return "/products/:slug";
  if (segs[0] === "articles" && segs[1]) return "/articles/:slug";
  if (segs[0] === "landing" && segs[1]) return "/landing/:slug";
  return "/" + segs.slice(0, 2).join("/");
}
