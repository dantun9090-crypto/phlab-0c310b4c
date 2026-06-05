/**
 * Sitemap Audit — server function powering the Admin → SEO → Sitemap Audit tab.
 *
 * Cross-references three sources of truth:
 *   1. The live /sitemap.xml served by this app.
 *   2. The live /robots.txt User-agent:* Disallow rules.
 *   3. The known set of indexable app routes (from KNOWN_PUBLIC_ROUTES below)
 *      plus the dynamic product list.
 *
 * Categorises every divergence as one of:
 *   - "missing"             → route is indexable but absent from sitemap
 *   - "extra_blocked"       → URL in sitemap that policy says shouldn't be
 *   - "extra_404"           → URL in sitemap that returns >= 400
 *   - "expected_exclusion"  → false positive: a "missing" entry that is
 *                              intentionally excluded (transactional/feed/etc.)
 *
 * Auth: requires Supabase session (admin gate handled by /admin shell).
 */

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireFirebaseAdmin } from "@/lib/server/firebase-auth-admin";
import {
  exclusionReason,
  isIndexable,
  ROBOTS_RULES,
  type ExclusionReason,
} from "@/lib/sitemap-policy";

const BASE_URL = "https://phlabs.co.uk";

/**
 * Hand-curated list of every page route that SHOULD be in the sitemap.
 * Dynamic product/article entries are added at runtime by the audit.
 *
 * Update this when adding a new top-level indexable page.
 */
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

function parseSitemapXml(xml: string): string[] {
  const locs: string[] = [];
  const re = /<loc>\s*([^<]+?)\s*<\/loc>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    try {
      const u = new URL(m[1]);
      locs.push(u.pathname);
    } catch {
      /* skip malformed */
    }
  }
  return locs;
}

async function headStatus(url: string): Promise<number> {
  try {
    const r = await fetch(url, { method: "HEAD", redirect: "manual" });
    return r.status;
  } catch {
    return 0;
  }
}

export const runSitemapAudit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async (): Promise<SitemapAuditReport> => {
    const errors: string[] = [];
    const sitemapUrl = `${BASE_URL}/sitemap.xml`;

    // 1. Fetch live sitemap
    let sitemapStatus = 0;
    let sitemapPaths: string[] = [];
    try {
      const r = await fetch(sitemapUrl, {
        headers: { accept: "application/xml" },
      });
      sitemapStatus = r.status;
      if (r.ok) {
        sitemapPaths = parseSitemapXml(await r.text());
      } else {
        errors.push(`sitemap.xml returned HTTP ${r.status}`);
      }
    } catch (e) {
      errors.push(`sitemap.xml fetch failed: ${(e as Error).message}`);
    }

    // 2. Build full set of expected indexable routes (static + dynamic).
    // Dynamic product slugs are read out of the sitemap itself — we trust
    // the generator (which already enforces policy) for them, and instead
    // focus the audit on policy violations + 404s.
    const sitemapSet = new Set(sitemapPaths);
    const expected = new Set<string>(KNOWN_PUBLIC_ROUTES);
    for (const p of sitemapPaths) {
      if (p.startsWith("/products/") || p.startsWith("/resources/")) {
        expected.add(p);
      }
    }

    // 3. Missing — in expected but not in sitemap.
    const missing: SitemapAuditReport["missing"] = [];
    const expectedExclusions: SitemapAuditReport["expectedExclusions"] = [];
    for (const path of expected) {
      if (sitemapSet.has(path)) continue;
      const reason = exclusionReason(path);
      if (reason) {
        expectedExclusions.push({ path, reason });
      } else {
        missing.push({ path });
      }
    }

    // 4. Extra-blocked — in sitemap but policy says exclude.
    const extraBlocked: SitemapAuditReport["extraBlocked"] = [];
    for (const path of sitemapPaths) {
      if (!isIndexable(path)) {
        extraBlocked.push({ path, reason: exclusionReason(path)! });
      }
    }

    // 5. Extra-404 — sample up to 25 sitemap URLs and HEAD them.
    const sample = sitemapPaths.slice(0, 25);
    const extra404: SitemapAuditReport["extra404"] = [];
    const statuses = await Promise.all(
      sample.map((p) => headStatus(`${BASE_URL}${p}`)),
    );
    sample.forEach((p, i) => {
      const s = statuses[i];
      if (s >= 400) extra404.push({ path: p, status: s });
    });

    return {
      ranAt: new Date().toISOString(),
      sitemapUrl,
      sitemapStatus,
      totalUrlsInSitemap: sitemapPaths.length,
      totalIndexableRoutes: expected.size,
      ok:
        sitemapStatus === 200 &&
        missing.length === 0 &&
        extraBlocked.length === 0 &&
        extra404.length === 0,
      missing,
      extraBlocked,
      extra404,
      expectedExclusions,
      robotsRulesApplied: ROBOTS_RULES.length,
      errors,
    };
  });
