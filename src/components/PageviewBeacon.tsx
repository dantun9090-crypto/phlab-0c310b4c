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
  }, [pathname]);

  return null;
}
