/**
 * Sitemap Audit — client-safe server-function wrapper for Admin → SEO.
 * Server-only Firestore/Admin SDK logic lives in sitemap-audit.server.ts.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { ExclusionReason } from "@/lib/sitemap-policy";

export const MAX_AUDIT_RUNS_PER_HOUR = 10;
const HOUR_MS = 60 * 60 * 1000;
const runWindow = new Map<string, number[]>();

export function checkAuditRateLimit(uid: string): {
  allowed: boolean;
  remaining: number;
  resetMs: number;
} {
  const now = Date.now();
  const arr = (runWindow.get(uid) ?? []).filter((t) => now - t < HOUR_MS);
  if (arr.length >= MAX_AUDIT_RUNS_PER_HOUR) {
    runWindow.set(uid, arr);
    return { allowed: false, remaining: 0, resetMs: HOUR_MS - (now - arr[0]) };
  }
  arr.push(now);
  runWindow.set(uid, arr);
  return {
    allowed: true,
    remaining: MAX_AUDIT_RUNS_PER_HOUR - arr.length,
    resetMs: HOUR_MS,
  };
}

export const KNOWN_PUBLIC_ROUTES: readonly string[] = [
  "/",
  "/products",
  "/research",
  "/quality-control",
  "/lab-reports",
  "/resources",
  "/storage-guide",
  "/about",
  "/contact",
  "/shipping-policy",
  "/refund-policy",
  "/terms-and-conditions",
  "/privacy-policy",
  "/cookies",
];

export interface SitemapAuditReport {
  ranAt: string;
  sitemapUrl: string;
  sitemapStatus: number;
  totalUrlsInSitemap: number;
  totalIndexableRoutes: number;
  ok: boolean;
  missing: Array<{ path: string; note?: string }>;
  extraBlocked: Array<{ path: string; reason: ExclusionReason }>;
  extra404: Array<{ path: string; status: number }>;
  expectedExclusions: Array<{ path: string; reason: ExclusionReason }>;
  robotsRulesApplied: number;
  errors: string[];
}

export const runSitemapAudit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { idToken: string }) => {
    if (!data?.idToken || typeof data.idToken !== "string") {
      throw new Error("forbidden: admin id token required");
    }
    return data;
  })
  .handler(async ({ data }): Promise<SitemapAuditReport> => {
    const { runSitemapAuditServer } = await import("@/lib/sitemap-audit.server");
    return runSitemapAuditServer(data);
  });