/**
 * PageviewBeacon — fires POST /api/pageview on every route change so
 * Lovable analytics (which depend on origin hits) still count visits
 * even when Cloudflare serves cached HTML from the edge.
 *
 * Invisible: no UI, no layout shift, silent failures.
 */
import { useEffect, useRef } from "react";
import { useRouterState } from "@tanstack/react-router";

const EXCLUDED_PREFIXES = [
  "/admin",
  "/checkout",
  "/cart",
  "/payment",
  "/login",
  "/register",
  "/account",
  "/api",
  "/webhook",
  "/__/",
];

function isExcluded(pathname: string): boolean {
  return EXCLUDED_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/") || pathname.startsWith(p));
}

export function PageviewBeacon() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const lastSent = useRef<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (isExcluded(pathname)) return;
    if (pathname === "/compound" || pathname.startsWith("/compound/")) return;
    if (lastSent.current === pathname) return;
    lastSent.current = pathname;
    try {
      fetch("/api/pageview", {
        method: "POST",
        keepalive: true,
        credentials: "same-origin",
        cache: "no-store",
        headers: { "Content-Type": "text/plain" },
        body: pathname,
      }).catch(() => {});
    } catch {
      /* ignore */
    }

    // Record page_view into Supabase analytics_events (RLS-allowed anon
    // insert) via a plain PostgREST call — importing the supabase-js SDK
    // here cost every visitor ~200 KB of JS (GoTrueClient, realtime,
    // storage) for a single INSERT.
    try {
      const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
      const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;
      if (SUPABASE_URL && SUPABASE_KEY) {
        fetch(`${SUPABASE_URL}/rest/v1/analytics_events`, {
          method: "POST",
          keepalive: true,
          headers: {
            "content-type": "application/json",
            apikey: SUPABASE_KEY,
            authorization: `Bearer ${SUPABASE_KEY}`,
            prefer: "return=minimal",
          },
          body: JSON.stringify({
            event_type: "page_view",
            path: pathname.slice(0, 2048),
            user_agent: (navigator.userAgent || "").slice(0, 1024),
          }),
        }).catch(() => {});
      }
    } catch {
      /* ignore */
    }
  }, [pathname]);

  return null;
}
