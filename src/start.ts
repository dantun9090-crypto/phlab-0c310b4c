import { createStart, createMiddleware } from "@tanstack/react-start";

import { renderErrorPage } from "./lib/error-page";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";
import { enforceRateLimit } from "@/lib/rate-limit";

// NOTE: prerenderMiddleware intentionally NOT registered here.
// Prerender.io interception is handled exclusively at the Cloudflare Worker
// layer (src/server.ts). Running it again as a TanStack middleware caused a
// double-fetch on the Worker's loop-guard fallback path.

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error(error);
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

/**
 * Blanket per-IP rate limit for every `/api/public/*` handler.
 * 100 requests / 15 min / IP — the spec cap.
 *
 * Health probes are excluded so uptime monitors don't self-DoS the limiter.
 * Per-endpoint limiters (Wallid, Fena, TrueLayer, etc.) keep running INSIDE
 * their handlers with tighter thresholds and `bad-auth` buckets; this
 * middleware is the outer floor that catches everything else, including any
 * new public endpoint added later that forgets to install its own limiter.
 */
const PUBLIC_API_RATE_LIMIT_EXCLUDED = new Set<string>([
  "/api/public/health",
  "/api/public/health-deep",
]);

const publicApiRateLimitMiddleware = createMiddleware().server(async ({ next, request }) => {
  try {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/public/")) {
      const path = url.pathname.replace(/\/$/, "");
      if (!PUBLIC_API_RATE_LIMIT_EXCLUDED.has(path)) {
        const blocked = await enforceRateLimit(request, `blanket:${path}`, {
          limit: 100,
          windowMs: 15 * 60 * 1000,
          retryAfterSec: 15 * 60,
        });
        if (blocked) return blocked;
      }
    }
  } catch {
    // A limiter fault must never break the request path — fall through.
  }
  return next();
});

export const startInstance = createStart(() => ({
  requestMiddleware: [errorMiddleware, publicApiRateLimitMiddleware],
  functionMiddleware: [attachSupabaseAuth],
}));


