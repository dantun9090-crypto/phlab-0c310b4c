/**
 * PageviewBeacon — fires POST /api/pageview on every route change so
 * Lovable analytics (which depend on origin hits) still count visits
 * even when Cloudflare serves cached HTML from the edge.
 *
 * Invisible: no UI, no layout shift, silent failures.
 */
import { useEffect, useRef } from "react";
import { useRouterState } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

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

    // Record page_view into Supabase analytics_events (RLS-allowed anon insert).
    try {
      supabase
        .from("analytics_events")
        .insert({
          event_type: "page_view",
          path: pathname.slice(0, 2048),
          user_agent: (navigator.userAgent || "").slice(0, 1024),
        })
        .then(() => {}, () => {});
    } catch {
      /* ignore */
    }
  }, [pathname]);

  return null;
}
